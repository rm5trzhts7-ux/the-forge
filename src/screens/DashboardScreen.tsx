import { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Card, colors, Field, PrimaryButton, SectionTitle, StatCard } from "../components/ui";
import { supabase } from "../lib/supabase";
import { DailyCheckIn, RecoveryLog, RestPeriod, TabKey, WorkoutLog } from "../types/logs";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "home", label: "Home" },
  { key: "workout", label: "Workout" },
  { key: "recovery", label: "Recovery" },
  { key: "checkin", label: "Check-in" },
  { key: "stats", label: "Stats" }
];

const forgeTips = [
  "Small plates still build big momentum. Log the work and move on.",
  "Recovery is training. Sauna and cold exposure count when you track them.",
  "Leave one clean note your future self can use.",
  "Consistency beats intensity when intensity only shows up once.",
  "If soreness is high, earn tomorrow by recovering well today."
];

type DetailKey =
  | "workouts"
  | "volume"
  | "sauna"
  | "cold"
  | "energy"
  | "sleep"
  | "avgRest"
  | "longestRest"
  | "shortestRest"
  | "totalRest";

type EditableTable = "workout_logs" | "recovery_logs" | "daily_checkins" | "rest_periods";
type EditableValues = Record<string, string | number | null>;

type DashboardData = {
  workouts: WorkoutLog[];
  restPeriods: RestPeriod[];
  recovery: RecoveryLog[];
  checkins: DailyCheckIn[];
};

const emptyData: DashboardData = {
  workouts: [],
  restPeriods: [],
  recovery: [],
  checkins: []
};

export function DashboardScreen({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<DetailKey | null>(null);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [workouts, restPeriods, recovery, checkins] = await Promise.all([
      supabase.from("workout_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("rest_periods").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("recovery_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("daily_checkins").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false })
    ]);

    setRefreshing(false);

    const firstError = workouts.error || restPeriods.error || recovery.error || checkins.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      Alert.alert("Could not load logs", firstError.message);
      return;
    }

    setErrorMessage("");
    setData({
      workouts: (workouts.data ?? []) as WorkoutLog[],
      restPeriods: (restPeriods.data ?? []) as RestPeriod[],
      recovery: (recovery.data ?? []) as RecoveryLog[],
      checkins: (checkins.data ?? []) as DailyCheckIn[]
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => buildStats(data), [data]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function saveRow(table: string, values: Record<string, string | number | null>) {
    setSaving(true);
    const { error } = await supabase.from(table).insert({
      user_id: session.user.id,
      ...values
    });
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      Alert.alert("Save failed", error.message);
      return false;
    }

    setErrorMessage("");
    Alert.alert("Logged", forgeTips[Math.floor(Math.random() * forgeTips.length)]);
    await loadData();
    return true;
  }

  async function saveWorkout(values: {
    exercise: string;
    sets: number;
    reps: number;
    weight: number;
    notes: string | null;
    restDurations: number[];
  }) {
    setSaving(true);
    const { data: workout, error: workoutError } = await supabase
      .from("workout_logs")
      .insert({
        user_id: session.user.id,
        exercise: values.exercise,
        sets: values.sets,
        reps: values.reps,
        weight: values.weight,
        notes: values.notes
      })
      .select("id")
      .single();

    if (workoutError) {
      setSaving(false);
      setErrorMessage(workoutError.message);
      Alert.alert("Workout save failed", workoutError.message);
      return false;
    }

    if (values.restDurations.length > 0) {
      const restRows = values.restDurations.map((duration, index) => ({
        user_id: session.user.id,
        workout_id: workout.id,
        duration_seconds: duration,
        interval_order: index + 1
      }));
      const { error: restError } = await supabase.from("rest_periods").insert(restRows);

      if (restError) {
        setSaving(false);
        setErrorMessage(restError.message);
        Alert.alert("Rest timer save failed", restError.message);
        return false;
      }
    }

    setSaving(false);
    setErrorMessage("");
    Alert.alert("Workout logged", forgeTips[Math.floor(Math.random() * forgeTips.length)]);
    await loadData();
    return true;
  }

  async function updateLog(table: EditableTable, id: string, values: EditableValues) {
    setSaving(true);
    const { error } = await supabase.from(table).update(values).eq("id", id).eq("user_id", session.user.id);
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      Alert.alert("Update failed", error.message);
      return false;
    }

    setErrorMessage("");
    await loadData();
    return true;
  }

  async function deleteLog(table: EditableTable, id: string) {
    setSaving(true);
    const { error } = await supabase.from(table).delete().eq("id", id).eq("user_id", session.user.id);
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      Alert.alert("Delete failed", error.message);
      return false;
    }

    setErrorMessage("");
    await loadData();
    return true;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>THE FORGE</Text>
          <Text style={styles.email}>{session.user.email}</Text>
        </View>
        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.accent} />}
      >
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>Supabase error</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
        {activeTab === "home" ? <Home stats={stats} setActiveTab={setActiveTab} openDetail={setSelectedDetail} /> : null}
        {activeTab === "workout" ? <WorkoutForm saving={saving} saveWorkout={saveWorkout} /> : null}
        {activeTab === "recovery" ? <RecoveryForms saving={saving} saveRow={saveRow} /> : null}
        {activeTab === "checkin" ? <CheckInForm saving={saving} saveRow={saveRow} /> : null}
        {activeTab === "stats" ? <StatsPanel stats={stats} openDetail={setSelectedDetail} /> : null}
      </ScrollView>

      <DetailModal
        data={data}
        detailKey={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        onDelete={deleteLog}
        onUpdate={updateLog}
        saving={saving}
      />

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Home({
  stats,
  setActiveTab,
  openDetail
}: {
  stats: ReturnType<typeof buildStats>;
  setActiveTab: (tab: TabKey) => void;
  openDetail: (detail: DetailKey) => void;
}) {
  return (
    <View style={styles.stack}>
      <SectionTitle title="Dashboard" subtitle="Your last 7 days of work, recovery, and readiness." />
      <View style={styles.statGrid}>
        <StatCard label="Workouts" value={stats.workouts} onPress={() => openDetail("workouts")} />
        <StatCard label="Volume" value={`${stats.volume} lb`} onPress={() => openDetail("volume")} />
        <StatCard label="Sauna" value={`${stats.saunaMinutes} min`} onPress={() => openDetail("sauna")} />
        <StatCard label="Cold" value={`${stats.plungeMinutes} min`} onPress={() => openDetail("cold")} />
        <StatCard label="Avg rest" value={stats.avgRestTime} onPress={() => openDetail("avgRest")} />
      </View>
      <Card>
        <Text style={styles.cardTitle}>Today</Text>
        <Text style={styles.cardCopy}>{stats.insight}</Text>
        <View style={styles.quickActions}>
          <MiniAction title="Log workout" onPress={() => setActiveTab("workout")} />
          <MiniAction title="Log recovery" onPress={() => setActiveTab("recovery")} />
          <MiniAction title="Check in" onPress={() => setActiveTab("checkin")} />
        </View>
      </Card>
    </View>
  );
}

function WorkoutForm({
  saving,
  saveWorkout
}: {
  saving: boolean;
  saveWorkout: (values: {
    exercise: string;
    sets: number;
    reps: number;
    weight: number;
    notes: string | null;
    restDurations: number[];
  }) => Promise<boolean>;
}) {
  const [exercise, setExercise] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [restDurations, setRestDurations] = useState<number[]>([]);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [elapsedRestSeconds, setElapsedRestSeconds] = useState(0);
  const isResting = restStartedAt !== null;
  const workoutAverageRest = averageSeconds(restDurations);

  useEffect(() => {
    if (!restStartedAt) {
      return;
    }

    setElapsedRestSeconds(Math.max(0, Math.floor((Date.now() - restStartedAt) / 1000)));
    const interval = setInterval(() => {
      setElapsedRestSeconds(Math.max(0, Math.floor((Date.now() - restStartedAt) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [restStartedAt]);

  function startRest() {
    setRestStartedAt(Date.now());
    setElapsedRestSeconds(0);
  }

  function stopRest() {
    if (!restStartedAt) {
      return;
    }

    const duration = Math.max(1, Math.floor((Date.now() - restStartedAt) / 1000));
    setRestDurations((current) => [...current, duration]);
    setRestStartedAt(null);
    setElapsedRestSeconds(0);
  }

  async function submit() {
    if (!exercise.trim() || !positiveNumber(sets) || !positiveNumber(reps) || Number(weight || 0) < 0) {
      Alert.alert("Missing lift details", "Add an exercise, sets, reps, and a valid weight.");
      return;
    }

    const finalRestDurations = [...restDurations];
    if (restStartedAt) {
      finalRestDurations.push(Math.max(1, Math.floor((Date.now() - restStartedAt) / 1000)));
    }

    const saved = await saveWorkout({
      exercise: exercise.trim(),
      sets: Number(sets),
      reps: Number(reps),
      weight: Number(weight || 0),
      notes: notes.trim() || null,
      restDurations: finalRestDurations
    });

    if (saved) {
      setExercise("");
      setSets("");
      setReps("");
      setWeight("");
      setNotes("");
      setRestDurations([]);
      setRestStartedAt(null);
      setElapsedRestSeconds(0);
    }
  }

  return (
    <View style={styles.stack}>
      <SectionTitle title="Workout Log" subtitle={forgeTips[0]} />
      <Card>
        <Field label="Exercise" onChangeText={setExercise} value={exercise} placeholder="Back squat" />
        <View style={styles.row}>
          <Field label="Sets" keyboardType="number-pad" onChangeText={setSets} value={sets} />
          <Field label="Reps" keyboardType="number-pad" onChangeText={setReps} value={reps} />
        </View>
        <Field label="Weight" keyboardType="decimal-pad" onChangeText={setWeight} value={weight} placeholder="225" />
        <Field label="Notes" multiline onChangeText={setNotes} value={notes} placeholder="Depth felt clean." />
        <View style={styles.restTimerPanel}>
          <Text style={styles.restLabel}>Rest timer</Text>
          <Text style={styles.restTime}>{formatSeconds(elapsedRestSeconds)}</Text>
          <Text style={styles.restHint}>
            {isResting ? "Stop when the next set starts." : "Start after a set, stop before the next one."}
          </Text>
          <Pressable
            onPress={isResting ? stopRest : startRest}
            style={({ pressed }) => [
              styles.restButton,
              isResting ? styles.restButtonStop : styles.restButtonStart,
              pressed && styles.restButtonPressed
            ]}
          >
            <Text style={styles.restButtonText}>{isResting ? "Stop Rest" : "Start Rest"}</Text>
          </Pressable>
        </View>
        <View style={styles.restSummary}>
          <View style={styles.restSummaryRow}>
            <Text style={styles.restSummaryLabel}>Saved rests</Text>
            <Text style={styles.restSummaryValue}>{restDurations.length}</Text>
          </View>
          <View style={styles.restSummaryRow}>
            <Text style={styles.restSummaryLabel}>Workout average</Text>
            <Text style={styles.restSummaryValue}>
              {workoutAverageRest === "-" ? "-" : formatSeconds(Number(workoutAverageRest))}
            </Text>
          </View>
          {restDurations.length > 0 ? (
            <View style={styles.restList}>
              {restDurations.map((duration, index) => (
                <View key={`${duration}-${index}`} style={styles.restInterval}>
                  <Text style={styles.restIntervalLabel}>Rest {index + 1}</Text>
                  <Text style={styles.restIntervalValue}>{formatSeconds(duration)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.restEmpty}>No rest intervals saved yet.</Text>
          )}
        </View>
        <PrimaryButton loading={saving} onPress={submit} title="Save Workout" />
      </Card>
    </View>
  );
}

function RecoveryForms({
  saving,
  saveRow
}: {
  saving: boolean;
  saveRow: (table: string, values: Record<string, string | number | null>) => Promise<boolean>;
}) {
  const [saunaDuration, setSaunaDuration] = useState("");
  const [saunaNotes, setSaunaNotes] = useState("");
  const [plungeDuration, setPlungeDuration] = useState("");
  const [temperature_f, setTemperature] = useState("");
  const [plungeNotes, setPlungeNotes] = useState("");

  async function saveSauna() {
    if (!positiveNumber(saunaDuration)) {
      Alert.alert("Add duration", "Sauna duration should be at least 1 minute.");
      return;
    }

    const saved = await saveRow("recovery_logs", {
      recovery_type: "sauna",
      duration_minutes: Number(saunaDuration),
      temperature_f: null,
      notes: saunaNotes.trim() || null
    });
    if (saved) {
      setSaunaDuration("");
      setSaunaNotes("");
    }
  }

  async function savePlunge() {
    if (!positiveNumber(plungeDuration) || !positiveNumber(temperature_f) || Number(temperature_f) < 32 || Number(temperature_f) > 80) {
      Alert.alert("Add plunge details", "Duration is required and temperature should be 32-80 F.");
      return;
    }

    const saved = await saveRow("recovery_logs", {
      recovery_type: "cold_plunge",
      duration_minutes: Number(plungeDuration),
      temperature_f: Number(temperature_f),
      notes: plungeNotes.trim() || null
    });
    if (saved) {
      setPlungeDuration("");
      setTemperature("");
      setPlungeNotes("");
    }
  }

  return (
    <View style={styles.stack}>
      <SectionTitle title="Recovery Log" subtitle={forgeTips[1]} />
      <Card>
        <Text style={styles.cardTitle}>Sauna</Text>
        <Field label="Duration minutes" keyboardType="number-pad" onChangeText={setSaunaDuration} value={saunaDuration} />
        <Field label="Notes" multiline onChangeText={setSaunaNotes} value={saunaNotes} placeholder="Easy nasal breathing." />
        <PrimaryButton loading={saving} onPress={saveSauna} title="Save Sauna" />
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Cold Plunge</Text>
        <Field label="Duration minutes" keyboardType="number-pad" onChangeText={setPlungeDuration} value={plungeDuration} />
        <Field label="Temperature F" keyboardType="decimal-pad" onChangeText={setTemperature} value={temperature_f} placeholder="45" />
        <Field label="Notes" multiline onChangeText={setPlungeNotes} value={plungeNotes} placeholder="First minute was rough." />
        <PrimaryButton loading={saving} onPress={savePlunge} title="Save Cold Plunge" />
      </Card>
    </View>
  );
}

function CheckInForm({
  saving,
  saveRow
}: {
  saving: boolean;
  saveRow: (table: string, values: Record<string, string | number | null>) => Promise<boolean>;
}) {
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [soreness, setSoreness] = useState("");
  const [sleep, setSleep] = useState("");
  const [motivation, setMotivation] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    const values = [mood, energy, soreness, sleep, motivation];
    if (!values.every(scoreInRange)) {
      Alert.alert("Use 1-10 scores", "Mood, energy, soreness, sleep, and motivation should be 1 through 10.");
      return;
    }

    const saved = await saveRow("daily_checkins", {
      mood: Number(mood),
      energy: Number(energy),
      soreness: Number(soreness),
      sleep: Number(sleep),
      motivation: Number(motivation),
      notes: notes.trim() || null
    });

    if (saved) {
      setMood("");
      setEnergy("");
      setSoreness("");
      setSleep("");
      setMotivation("");
      setNotes("");
    }
  }

  return (
    <View style={styles.stack}>
      <SectionTitle title="Daily Check-in" subtitle={forgeTips[2]} />
      <Card>
        <View style={styles.row}>
          <Field label="Mood" keyboardType="number-pad" onChangeText={setMood} value={mood} placeholder="1-10" />
          <Field label="Energy" keyboardType="number-pad" onChangeText={setEnergy} value={energy} placeholder="1-10" />
        </View>
        <View style={styles.row}>
          <Field label="Soreness" keyboardType="number-pad" onChangeText={setSoreness} value={soreness} placeholder="1-10" />
          <Field label="Sleep" keyboardType="number-pad" onChangeText={setSleep} value={sleep} placeholder="1-10" />
        </View>
        <Field label="Motivation" keyboardType="number-pad" onChangeText={setMotivation} value={motivation} placeholder="1-10" />
        <Field label="Notes" multiline onChangeText={setNotes} value={notes} placeholder="What does the body need today?" />
        <PrimaryButton loading={saving} onPress={submit} title="Save Check-in" />
      </Card>
    </View>
  );
}

function StatsPanel({
  stats,
  openDetail
}: {
  stats: ReturnType<typeof buildStats>;
  openDetail: (detail: DetailKey) => void;
}) {
  return (
    <View style={styles.stack}>
      <SectionTitle title="Weekly Stats" subtitle="Averages, totals, and the next useful signal." />
      <View style={styles.statGrid}>
        <StatCard label="Workouts" value={stats.workouts} onPress={() => openDetail("workouts")} />
        <StatCard label="Total volume" value={`${stats.volume} lb`} onPress={() => openDetail("volume")} />
        <StatCard label="Avg energy" value={stats.avgEnergy} onPress={() => openDetail("energy")} />
        <StatCard label="Avg sleep" value={stats.avgSleep} onPress={() => openDetail("sleep")} />
        <StatCard label="Sauna total" value={`${stats.saunaMinutes} min`} onPress={() => openDetail("sauna")} />
        <StatCard label="Cold total" value={`${stats.plungeMinutes} min`} onPress={() => openDetail("cold")} />
        <StatCard label="Avg rest" value={stats.avgRestTime} onPress={() => openDetail("avgRest")} />
        <StatCard label="Longest rest" value={stats.longestRestTime} onPress={() => openDetail("longestRest")} />
        <StatCard label="Shortest rest" value={stats.shortestRestTime} onPress={() => openDetail("shortestRest")} />
        <StatCard label="Total rest" value={stats.totalRestTime} onPress={() => openDetail("totalRest")} />
      </View>
      <Card>
        <Text style={styles.cardTitle}>Key insight</Text>
        <Text style={styles.cardCopy}>{stats.insight}</Text>
      </Card>
    </View>
  );
}

function DetailModal({
  data,
  detailKey,
  onClose,
  onDelete,
  onUpdate,
  saving
}: {
  data: DashboardData;
  detailKey: DetailKey | null;
  onClose: () => void;
  onDelete: (table: EditableTable, id: string) => Promise<boolean>;
  onUpdate: (table: EditableTable, id: string, values: EditableValues) => Promise<boolean>;
  saving: boolean;
}) {
  const workoutsById = useMemo(() => {
    return data.workouts.reduce<Record<string, WorkoutLog>>((lookup, workout) => {
      lookup[workout.id] = workout;
      return lookup;
    }, {});
  }, [data.workouts]);
  const detail = useMemo(() => getDetailItems(detailKey, data), [data, detailKey]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={detailKey !== null}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>Weekly detail</Text>
              <Text style={styles.modalTitle}>{detail.title}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {detail.items.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No logs yet</Text>
                <Text style={styles.emptyText}>This stat has no entries for the selected week.</Text>
              </View>
            ) : (
              detail.items.map((item) => (
                <LogEntryEditor
                  key={`${item.kind}-${item.log.id}`}
                  item={item}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  saving={saving}
                  workout={item.kind === "rest" ? workoutsById[item.log.workout_id] : undefined}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type DetailItem =
  | { kind: "workout"; log: WorkoutLog; showVolume: boolean }
  | { kind: "recovery"; log: RecoveryLog }
  | { kind: "checkin"; log: DailyCheckIn; focus: "energy" | "sleep" }
  | { kind: "rest"; log: RestPeriod };

function getDetailItems(detailKey: DetailKey | null, data: DashboardData): { title: string; items: DetailItem[] } {
  if (!detailKey) {
    return { title: "", items: [] };
  }

  if (detailKey === "workouts") {
    return {
      title: "Workout logs",
      items: data.workouts.map((log) => ({ kind: "workout", log, showVolume: false }))
    };
  }

  if (detailKey === "volume") {
    return {
      title: "Total volume",
      items: data.workouts.map((log) => ({ kind: "workout", log, showVolume: true }))
    };
  }

  if (detailKey === "sauna") {
    return {
      title: "Sauna logs",
      items: data.recovery.filter((log) => log.recovery_type === "sauna").map((log) => ({ kind: "recovery", log }))
    };
  }

  if (detailKey === "cold") {
    return {
      title: "Cold plunge logs",
      items: data.recovery.filter((log) => log.recovery_type === "cold_plunge").map((log) => ({ kind: "recovery", log }))
    };
  }

  if (detailKey === "energy" || detailKey === "sleep") {
    return {
      title: detailKey === "energy" ? "Energy check-ins" : "Sleep check-ins",
      items: data.checkins.map((log) => ({ kind: "checkin", log, focus: detailKey }))
    };
  }

  const durations = data.restPeriods.map((log) => Number(log.duration_seconds));
  const longest = durations.length > 0 ? Math.max(...durations) : null;
  const shortest = durations.length > 0 ? Math.min(...durations) : null;
  const restPeriods =
    detailKey === "longestRest" && longest !== null
      ? data.restPeriods.filter((log) => Number(log.duration_seconds) === longest)
      : detailKey === "shortestRest" && shortest !== null
        ? data.restPeriods.filter((log) => Number(log.duration_seconds) === shortest)
        : data.restPeriods;

  const titles: Record<"avgRest" | "longestRest" | "shortestRest" | "totalRest", string> = {
    avgRest: "Average rest time",
    longestRest: "Longest rest time",
    shortestRest: "Shortest rest time",
    totalRest: "Total rest time"
  };

  return {
    title: titles[detailKey],
    items: restPeriods.map((log) => ({ kind: "rest", log }))
  };
}

function LogEntryEditor({
  item,
  onDelete,
  onUpdate,
  saving,
  workout
}: {
  item: DetailItem;
  onDelete: (table: EditableTable, id: string) => Promise<boolean>;
  onUpdate: (table: EditableTable, id: string, values: EditableValues) => Promise<boolean>;
  saving: boolean;
  workout?: WorkoutLog;
}) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>(() => initialFields(item));
  const meta = getItemMeta(item, workout);

  function updateField(key: string, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function askDelete() {
    Alert.alert("Delete log?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          onDelete(meta.table, meta.id);
        }
      }
    ]);
  }

  async function saveEdit() {
    const values = valuesFromFields(item, fields);
    if (!values) {
      return;
    }

    const saved = await onUpdate(meta.table, meta.id, values);
    if (saved) {
      setEditing(false);
    }
  }

  return (
    <View style={styles.logCard}>
      <View style={styles.logHeader}>
        <View style={styles.logHeaderText}>
          <Text style={styles.logTitle}>{meta.title}</Text>
          <Text style={styles.logDate}>{formatDate(meta.createdAt)}</Text>
        </View>
        <View style={styles.logActions}>
          <Pressable onPress={() => setEditing((value) => !value)} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>{editing ? "Cancel" : "Edit"}</Text>
          </Pressable>
          <Pressable onPress={askDelete} style={styles.deleteAction}>
            <Text style={styles.deleteActionText}>Delete</Text>
          </Pressable>
        </View>
      </View>

      {editing ? (
        <View style={styles.editForm}>
          {renderEditFields(item, fields, updateField)}
          <PrimaryButton loading={saving} onPress={saveEdit} title="Save Changes" />
        </View>
      ) : (
        <View style={styles.logRows}>
          {meta.rows.map((row) => (
            <View key={row.label} style={styles.logRow}>
              <Text style={styles.logRowLabel}>{row.label}</Text>
              <Text style={styles.logRowValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function initialFields(item: DetailItem): Record<string, string> {
  if (item.kind === "workout") {
    return {
      exercise: item.log.exercise,
      sets: String(item.log.sets),
      reps: String(item.log.reps),
      weight: String(item.log.weight),
      notes: item.log.notes ?? ""
    };
  }

  if (item.kind === "recovery") {
    return {
      duration_minutes: String(item.log.duration_minutes),
      temperature_f: item.log.temperature_f === null ? "" : String(item.log.temperature_f),
      notes: item.log.notes ?? ""
    };
  }

  if (item.kind === "checkin") {
    return {
      mood: String(item.log.mood),
      energy: String(item.log.energy),
      soreness: String(item.log.soreness),
      sleep: String(item.log.sleep),
      motivation: String(item.log.motivation),
      notes: item.log.notes ?? ""
    };
  }

  return {
    duration_seconds: String(item.log.duration_seconds),
    interval_order: String(item.log.interval_order)
  };
}

function renderEditFields(item: DetailItem, fields: Record<string, string>, updateField: (key: string, value: string) => void) {
  if (item.kind === "workout") {
    return (
      <>
        <Field label="Exercise" onChangeText={(value) => updateField("exercise", value)} value={fields.exercise} />
        <View style={styles.row}>
          <Field label="Sets" keyboardType="number-pad" onChangeText={(value) => updateField("sets", value)} value={fields.sets} />
          <Field label="Reps" keyboardType="number-pad" onChangeText={(value) => updateField("reps", value)} value={fields.reps} />
        </View>
        <Field label="Weight" keyboardType="decimal-pad" onChangeText={(value) => updateField("weight", value)} value={fields.weight} />
        <Field label="Notes" multiline onChangeText={(value) => updateField("notes", value)} value={fields.notes} />
      </>
    );
  }

  if (item.kind === "recovery") {
    return (
      <>
        <Field
          label="Duration minutes"
          keyboardType="number-pad"
          onChangeText={(value) => updateField("duration_minutes", value)}
          value={fields.duration_minutes}
        />
        {item.log.recovery_type === "cold_plunge" ? (
          <Field
            label="Temperature F"
            keyboardType="decimal-pad"
            onChangeText={(value) => updateField("temperature_f", value)}
            value={fields.temperature_f}
          />
        ) : null}
        <Field label="Notes" multiline onChangeText={(value) => updateField("notes", value)} value={fields.notes} />
      </>
    );
  }

  if (item.kind === "checkin") {
    return (
      <>
        <View style={styles.row}>
          <Field label="Mood" keyboardType="number-pad" onChangeText={(value) => updateField("mood", value)} value={fields.mood} />
          <Field label="Energy" keyboardType="number-pad" onChangeText={(value) => updateField("energy", value)} value={fields.energy} />
        </View>
        <View style={styles.row}>
          <Field label="Soreness" keyboardType="number-pad" onChangeText={(value) => updateField("soreness", value)} value={fields.soreness} />
          <Field label="Sleep" keyboardType="number-pad" onChangeText={(value) => updateField("sleep", value)} value={fields.sleep} />
        </View>
        <Field label="Motivation" keyboardType="number-pad" onChangeText={(value) => updateField("motivation", value)} value={fields.motivation} />
        <Field label="Notes" multiline onChangeText={(value) => updateField("notes", value)} value={fields.notes} />
      </>
    );
  }

  return (
    <>
      <Field
        label="Duration seconds"
        keyboardType="number-pad"
        onChangeText={(value) => updateField("duration_seconds", value)}
        value={fields.duration_seconds}
      />
      <Field
        label="Rest number"
        keyboardType="number-pad"
        onChangeText={(value) => updateField("interval_order", value)}
        value={fields.interval_order}
      />
    </>
  );
}

function valuesFromFields(item: DetailItem, fields: Record<string, string>): EditableValues | null {
  if (item.kind === "workout") {
    if (!fields.exercise.trim() || !positiveNumber(fields.sets) || !positiveNumber(fields.reps) || Number(fields.weight || 0) < 0) {
      Alert.alert("Check workout", "Exercise, sets, reps, and a valid weight are required.");
      return null;
    }

    return {
      exercise: fields.exercise.trim(),
      sets: Number(fields.sets),
      reps: Number(fields.reps),
      weight: Number(fields.weight || 0),
      notes: fields.notes.trim() || null
    };
  }

  if (item.kind === "recovery") {
    if (!positiveNumber(fields.duration_minutes)) {
      Alert.alert("Check recovery", "Duration must be at least 1 minute.");
      return null;
    }

    if (item.log.recovery_type === "cold_plunge" && (!positiveNumber(fields.temperature_f) || Number(fields.temperature_f) < 32 || Number(fields.temperature_f) > 80)) {
      Alert.alert("Check cold plunge", "Temperature should be 32-80 F.");
      return null;
    }

    return {
      duration_minutes: Number(fields.duration_minutes),
      temperature_f: item.log.recovery_type === "sauna" ? null : Number(fields.temperature_f),
      notes: fields.notes.trim() || null
    };
  }

  if (item.kind === "checkin") {
    const scores = ["mood", "energy", "soreness", "sleep", "motivation"];
    if (!scores.every((score) => scoreInRange(fields[score]))) {
      Alert.alert("Check scores", "All check-in scores should be 1 through 10.");
      return null;
    }

    return {
      mood: Number(fields.mood),
      energy: Number(fields.energy),
      soreness: Number(fields.soreness),
      sleep: Number(fields.sleep),
      motivation: Number(fields.motivation),
      notes: fields.notes.trim() || null
    };
  }

  if (!positiveNumber(fields.duration_seconds) || !positiveNumber(fields.interval_order)) {
    Alert.alert("Check rest interval", "Duration seconds and rest number must be positive.");
    return null;
  }

  return {
    duration_seconds: Number(fields.duration_seconds),
    interval_order: Number(fields.interval_order)
  };
}

function getItemMeta(item: DetailItem, workout?: WorkoutLog) {
  if (item.kind === "workout") {
    const volume = Number(item.log.sets) * Number(item.log.reps) * Number(item.log.weight);
    return {
      createdAt: item.log.created_at,
      id: item.log.id,
      table: "workout_logs" as EditableTable,
      title: item.log.exercise,
      rows: [
        { label: "Sets x reps", value: `${item.log.sets} x ${item.log.reps}` },
        { label: "Weight", value: `${item.log.weight} lb` },
        { label: "Volume", value: `${volume} lb` },
        { label: "Notes", value: item.log.notes || "-" }
      ]
    };
  }

  if (item.kind === "recovery") {
    return {
      createdAt: item.log.created_at,
      id: item.log.id,
      table: "recovery_logs" as EditableTable,
      title: item.log.recovery_type === "sauna" ? "Sauna" : "Cold plunge",
      rows: [
        { label: "Duration", value: `${item.log.duration_minutes} min` },
        { label: "Temperature", value: item.log.temperature_f === null ? "-" : `${item.log.temperature_f} F` },
        { label: "Notes", value: item.log.notes || "-" }
      ]
    };
  }

  if (item.kind === "checkin") {
    return {
      createdAt: item.log.created_at,
      id: item.log.id,
      table: "daily_checkins" as EditableTable,
      title: item.focus === "energy" ? `Energy ${item.log.energy}/10` : `Sleep ${item.log.sleep}/10`,
      rows: [
        { label: "Mood", value: `${item.log.mood}/10` },
        { label: "Energy", value: `${item.log.energy}/10` },
        { label: "Soreness", value: `${item.log.soreness}/10` },
        { label: "Sleep", value: `${item.log.sleep}/10` },
        { label: "Motivation", value: `${item.log.motivation}/10` },
        { label: "Notes", value: item.log.notes || "-" }
      ]
    };
  }

  return {
    createdAt: item.log.created_at,
    id: item.log.id,
    table: "rest_periods" as EditableTable,
    title: `Rest ${item.log.interval_order}`,
    rows: [
      { label: "Duration", value: formatSeconds(Number(item.log.duration_seconds)) },
      { label: "Workout", value: workout ? workout.exercise : item.log.workout_id },
      { label: "Workout date", value: workout ? formatDate(workout.created_at) : "-" }
    ]
  };
}

function MiniAction({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.miniAction}>
      <Text style={styles.miniActionText}>{title}</Text>
    </Pressable>
  );
}

function buildStats(data: DashboardData) {
  const volume = data.workouts.reduce((total, log) => total + Number(log.sets) * Number(log.reps) * Number(log.weight), 0);
  const saunaMinutes = data.recovery
    .filter((log) => log.recovery_type === "sauna")
    .reduce((total, log) => total + Number(log.duration_minutes), 0);
  const plungeMinutes = data.recovery
    .filter((log) => log.recovery_type === "cold_plunge")
    .reduce((total, log) => total + Number(log.duration_minutes), 0);
  const avgEnergy = average(data.checkins.map((log) => log.energy));
  const avgSleep = average(data.checkins.map((log) => log.sleep));
  const avgSoreness = average(data.checkins.map((log) => log.soreness));
  const restDurations = data.restPeriods.map((rest) => Number(rest.duration_seconds));
  const avgRest = averageSeconds(restDurations);
  const longestRest = restDurations.length > 0 ? Math.max(...restDurations) : null;
  const shortestRest = restDurations.length > 0 ? Math.min(...restDurations) : null;
  const totalRest = restDurations.reduce((total, duration) => total + duration, 0);

  let insight = "Log a workout, recovery session, or check-in to start building your weekly signal.";
  if (data.workouts.length > 0 && avgEnergy !== "-") {
    insight = Number(avgEnergy) >= 7
      ? "Energy is trending strong. Push quality work while recovery is holding."
      : "Energy is running low. Keep the habit alive and bias toward clean recovery.";
  }
  if (Number(avgSoreness) >= 7) {
    insight = "Soreness is high. Make today's win mobility, sauna, sleep, and smarter loading.";
  }

  return {
    workouts: data.workouts.length,
    volume: Math.round(volume),
    saunaMinutes,
    plungeMinutes,
    avgRestTime: avgRest === "-" ? "-" : formatSeconds(Number(avgRest)),
    longestRestTime: longestRest === null ? "-" : formatSeconds(longestRest),
    shortestRestTime: shortestRest === null ? "-" : formatSeconds(shortestRest),
    totalRestTime: totalRest === 0 ? "-" : formatSeconds(totalRest),
    avgEnergy,
    avgSleep,
    insight
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return "-";
  }

  return (values.reduce((total, value) => total + Number(value), 0) / values.length).toFixed(1);
}

function averageSeconds(values: number[]) {
  if (values.length === 0) {
    return "-";
  }

  return Math.round(values.reduce((total, value) => total + Number(value), 0) / values.length);
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function positiveNumber(value: string) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function scoreInRange(value: string) {
  return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingTop: 52
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 14
  },
  brand: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.4
  },
  email: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3
  },
  signOut: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  signOutText: {
    color: colors.text,
    fontWeight: "800"
  },
  content: {
    padding: 18,
    paddingBottom: 96
  },
  errorBanner: {
    backgroundColor: "#2a1214",
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12
  },
  errorTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase"
  },
  errorText: {
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 18
  },
  stack: {
    gap: 14
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  cardCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  quickActions: {
    gap: 10
  },
  miniAction: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 13
  },
  miniActionText: {
    color: colors.text,
    fontWeight: "800"
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  restTimerPanel: {
    alignItems: "center",
    backgroundColor: "#09090b",
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 18
  },
  restLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  restTime: {
    color: colors.text,
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 1
  },
  restHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  restButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 58,
    width: "100%"
  },
  restButtonStart: {
    backgroundColor: colors.accent
  },
  restButtonStop: {
    backgroundColor: colors.danger
  },
  restButtonPressed: {
    opacity: 0.82
  },
  restButtonText: {
    color: "#111111",
    fontSize: 18,
    fontWeight: "900"
  },
  restSummary: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  restSummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  restSummaryLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  restSummaryValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  restList: {
    gap: 8,
    marginTop: 4
  },
  restInterval: {
    alignItems: "center",
    backgroundColor: "#151518",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  restIntervalLabel: {
    color: colors.muted,
    fontWeight: "800"
  },
  restIntervalValue: {
    color: colors.text,
    fontWeight: "900"
  },
  restEmpty: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  modalBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    flex: 1,
    justifyContent: "flex-end"
  },
  modalPanel: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    maxHeight: "88%",
    paddingTop: 18
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 14,
    paddingHorizontal: 18
  },
  modalEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 4
  },
  modalClose: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  modalCloseText: {
    color: colors.text,
    fontWeight: "800"
  },
  modalContent: {
    gap: 12,
    padding: 18,
    paddingBottom: 34
  },
  emptyState: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  },
  logCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  logHeader: {
    gap: 12
  },
  logHeaderText: {
    gap: 4
  },
  logTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  logDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  logActions: {
    flexDirection: "row",
    gap: 10
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10
  },
  secondaryActionText: {
    color: colors.accent,
    fontWeight: "900"
  },
  deleteAction: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10
  },
  deleteActionText: {
    color: "#fecaca",
    fontWeight: "900"
  },
  logRows: {
    gap: 8,
    marginTop: 14
  },
  logRow: {
    alignItems: "flex-start",
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10
  },
  logRowLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase"
  },
  logRowValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  editForm: {
    gap: 12,
    marginTop: 14
  },
  tabs: {
    backgroundColor: "#101012",
    borderColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 6,
    left: 0,
    padding: 10,
    position: "absolute",
    right: 0
  },
  tab: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    paddingVertical: 10
  },
  tabActive: {
    backgroundColor: colors.accent
  },
  tabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800"
  },
  tabTextActive: {
    color: "#111111"
  }
});
