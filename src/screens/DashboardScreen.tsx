import { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
        {activeTab === "home" ? <Home stats={stats} setActiveTab={setActiveTab} /> : null}
        {activeTab === "workout" ? <WorkoutForm saving={saving} saveWorkout={saveWorkout} /> : null}
        {activeTab === "recovery" ? <RecoveryForms saving={saving} saveRow={saveRow} /> : null}
        {activeTab === "checkin" ? <CheckInForm saving={saving} saveRow={saveRow} /> : null}
        {activeTab === "stats" ? <StatsPanel stats={stats} /> : null}
      </ScrollView>

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

function Home({ stats, setActiveTab }: { stats: ReturnType<typeof buildStats>; setActiveTab: (tab: TabKey) => void }) {
  return (
    <View style={styles.stack}>
      <SectionTitle title="Dashboard" subtitle="Your last 7 days of work, recovery, and readiness." />
      <View style={styles.statGrid}>
        <StatCard label="Workouts" value={stats.workouts} />
        <StatCard label="Volume" value={`${stats.volume} lb`} />
        <StatCard label="Sauna" value={`${stats.saunaMinutes} min`} />
        <StatCard label="Cold" value={`${stats.plungeMinutes} min`} />
        <StatCard label="Avg rest" value={stats.avgRestTime} />
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
  const [temperature, setTemperature] = useState("");
  const [plungeNotes, setPlungeNotes] = useState("");

  async function saveSauna() {
    if (!positiveNumber(saunaDuration)) {
      Alert.alert("Add duration", "Sauna duration should be at least 1 minute.");
      return;
    }

    const saved = await saveRow("recovery_logs", {
      recovery_type: "sauna",
      duration_minutes: Number(saunaDuration),
      temperature: null,
      notes: saunaNotes.trim() || null
    });
    if (saved) {
      setSaunaDuration("");
      setSaunaNotes("");
    }
  }

  async function savePlunge() {
    if (!positiveNumber(plungeDuration) || !positiveNumber(temperature) || Number(temperature) < 32 || Number(temperature) > 80) {
      Alert.alert("Add plunge details", "Duration is required and temperature should be 32-80 F.");
      return;
    }

    const saved = await saveRow("recovery_logs", {
      recovery_type: "cold_plunge",
      duration_minutes: Number(plungeDuration),
      temperature: Number(temperature),
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
        <Field label="Temperature F" keyboardType="decimal-pad" onChangeText={setTemperature} value={temperature} placeholder="45" />
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

function StatsPanel({ stats }: { stats: ReturnType<typeof buildStats> }) {
  return (
    <View style={styles.stack}>
      <SectionTitle title="Weekly Stats" subtitle="Averages, totals, and the next useful signal." />
      <View style={styles.statGrid}>
        <StatCard label="Workouts" value={stats.workouts} />
        <StatCard label="Total volume" value={`${stats.volume} lb`} />
        <StatCard label="Avg energy" value={stats.avgEnergy} />
        <StatCard label="Avg sleep" value={stats.avgSleep} />
        <StatCard label="Sauna total" value={`${stats.saunaMinutes} min`} />
        <StatCard label="Cold total" value={`${stats.plungeMinutes} min`} />
        <StatCard label="Avg rest" value={stats.avgRestTime} />
        <StatCard label="Longest rest" value={stats.longestRestTime} />
        <StatCard label="Shortest rest" value={stats.shortestRestTime} />
        <StatCard label="Total rest" value={stats.totalRestTime} />
      </View>
      <Card>
        <Text style={styles.cardTitle}>Key insight</Text>
        <Text style={styles.cardCopy}>{stats.insight}</Text>
      </Card>
    </View>
  );
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
