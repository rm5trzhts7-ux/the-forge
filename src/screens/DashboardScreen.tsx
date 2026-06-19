import { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { LoadingScreen } from "../components/LoadingScreen";
import { Card, colors, Field, PrimaryButton, SectionTitle, StatCard } from "../components/ui";
import { supabase } from "../lib/supabase";
import { CoachClientLink, DailyCheckIn, MacroLog, RecoveryLog, RestPeriod, TabKey, UserProfile, WorkoutLog } from "../types/logs";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "home", label: "Home" },
  { key: "workout", label: "Workout" },
  { key: "recovery", label: "Recovery" },
  { key: "checkin", label: "Check-in" },
  { key: "macros", label: "Macros" },
  { key: "stats", label: "Stats" },
  { key: "coaching", label: "Coach" }
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
  | "recovery"
  | "sauna"
  | "cold"
  | "energy"
  | "sleep"
  | "soreness"
  | "motivation"
  | "avgRest"
  | "longestRest"
  | "shortestRest"
  | "totalRest"
  | "macroCalories"
  | "macroProtein"
  | "macroCarbs"
  | "macroFat"
  | "macroWater"
  | "macroSodium"
  | "macroWeight"
  | "macroHighCalories"
  | "macroLowCalories";

type EditableTable = "workout_logs" | "recovery_logs" | "daily_checkins" | "rest_periods" | "macro_logs";
type EditableValues = Record<string, string | number | null>;

type DashboardData = {
  workouts: WorkoutLog[];
  restPeriods: RestPeriod[];
  recovery: RecoveryLog[];
  checkins: DailyCheckIn[];
  macros: MacroLog[];
};

type StatsCategory = "training" | "recovery" | "readiness" | "macros";

type ChartPoint = {
  label: string;
  value: number;
  secondaryValue?: number;
};

const emptyData: DashboardData = {
  workouts: [],
  restPeriods: [],
  recovery: [],
  checkins: [],
  macros: []
};

export function DashboardScreen({
  onInitialLoadComplete,
  session
}: {
  onInitialLoadComplete?: () => void;
  session: Session;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<DetailKey | null>(null);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [workouts, restPeriods, recovery, checkins, macros] = await Promise.all([
      supabase.from("workout_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("rest_periods").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("recovery_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("daily_checkins").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("macro_logs").select("*").gte("logged_date", dateKey(since)).order("logged_date", { ascending: false })
    ]);

    setRefreshing(false);

    const firstError = workouts.error || restPeriods.error || recovery.error || checkins.error || macros.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      setInitialLoading(false);
      onInitialLoadComplete?.();
      Alert.alert("Could not load logs", firstError.message);
      return;
    }

    setErrorMessage("");
    setData({
      workouts: (workouts.data ?? []) as WorkoutLog[],
      restPeriods: (restPeriods.data ?? []) as RestPeriod[],
      recovery: (recovery.data ?? []) as RecoveryLog[],
      checkins: (checkins.data ?? []) as DailyCheckIn[],
      macros: (macros.data ?? []) as MacroLog[]
    });
    setInitialLoading(false);
    onInitialLoadComplete?.();
  }, [onInitialLoadComplete]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => buildStats(data), [data]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (initialLoading) {
    return <LoadingScreen />;
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

  async function saveMacro(values: Omit<MacroLog, "id" | "user_id" | "created_at">) {
    setSaving(true);
    const { error } = await supabase.from("macro_logs").upsert(
      {
        user_id: session.user.id,
        ...values
      },
      { onConflict: "user_id,logged_date" }
    );
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      Alert.alert("Macro save failed", error.message);
      return false;
    }

    setErrorMessage("");
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

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardArea}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[styles.content, isFormTab(activeTab) && styles.formContent]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          scrollToOverflowEnabled
        >
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTitle}>Supabase error</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
          {activeTab === "home" ? <Home data={data} stats={stats} setActiveTab={setActiveTab} openDetail={setSelectedDetail} /> : null}
          {activeTab === "workout" ? <WorkoutForm saving={saving} saveWorkout={saveWorkout} /> : null}
          {activeTab === "recovery" ? <RecoveryForms saving={saving} saveRow={saveRow} /> : null}
          {activeTab === "checkin" ? <CheckInForm saving={saving} saveRow={saveRow} /> : null}
          {activeTab === "macros" ? <MacroForm macros={data.macros} saving={saving} saveMacro={saveMacro} /> : null}
          {activeTab === "stats" ? <StatsPanel data={data} stats={stats} openDetail={setSelectedDetail} /> : null}
          {activeTab === "coaching" ? <CoachingScreen session={session} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

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
  data,
  stats,
  setActiveTab,
  openDetail
}: {
  data: DashboardData;
  stats: ReturnType<typeof buildStats>;
  setActiveTab: (tab: TabKey) => void;
  openDetail: (detail: DetailKey) => void;
}) {
  const today = dateKey(new Date());
  const todayCheckIn = data.checkins.find((log) => dateKey(new Date(log.created_at)) === today);
  const todayMacro = data.macros.find((log) => log.logged_date === today);
  const latestWorkout = data.workouts[0];
  const suggestedAction = getSuggestedAction(Boolean(todayCheckIn), Boolean(todayMacro), Boolean(latestWorkout));

  return (
    <View style={styles.stack}>
      <SectionTitle title="Command Center" subtitle="What should you do today?" />

      <Card>
        <View style={styles.homeCardHeader}>
          <Text style={styles.homeEyebrow}>Readiness</Text>
          <Text style={styles.homeDate}>Today</Text>
        </View>
        {todayCheckIn ? (
          <>
            <Text style={styles.homeHeroValue}>Energy {todayCheckIn.energy}/10</Text>
            <Text style={styles.cardCopy}>
              Sleep {todayCheckIn.sleep}/10 | Soreness {todayCheckIn.soreness}/10 | Motivation {todayCheckIn.motivation}/10
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.homeHeroValue}>No signal yet</Text>
            <Text style={styles.cardCopy}>Start with a quick check-in so today's plan matches your body.</Text>
          </>
        )}
      </Card>

      <Card>
        <View style={styles.homeCardHeader}>
          <Text style={styles.homeEyebrow}>Macros</Text>
          <Pressable onPress={() => openDetail("macroCalories")}>
            <Text style={styles.homeLink}>History</Text>
          </Pressable>
        </View>
        {todayMacro ? (
          <View style={styles.homeMetricRow}>
            <HomeMetric label="Calories" value={String(todayMacro.calories)} />
            <HomeMetric label="Protein" value={`${todayMacro.protein_g}g`} />
            <HomeMetric label="Weight" value={`${todayMacro.body_weight_lb} lb`} />
          </View>
        ) : (
          <>
            <Text style={styles.homeHeroValue}>Macros open</Text>
            <Text style={styles.cardCopy}>Log calories, protein, water, sodium, and body weight for today.</Text>
          </>
        )}
      </Card>

      <Card>
        <Text style={styles.homeEyebrow}>Next Move</Text>
        {latestWorkout ? (
          <>
            <Text style={styles.homeHeroValue}>{latestWorkout.exercise}</Text>
            <Text style={styles.cardCopy}>
              Last logged {formatDate(latestWorkout.created_at)} | {latestWorkout.sets} x {latestWorkout.reps} at {latestWorkout.weight} lb
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.homeHeroValue}>{suggestedAction.title}</Text>
            <Text style={styles.cardCopy}>{suggestedAction.copy}</Text>
          </>
        )}
      </Card>

      <View style={styles.homeActions}>
        <MiniAction title="Log Workout" onPress={() => setActiveTab("workout")} />
        <MiniAction title="Log Recovery" onPress={() => setActiveTab("recovery")} />
        <MiniAction title="Check In" onPress={() => setActiveTab("checkin")} />
        <MiniAction title="Log Macros" onPress={() => setActiveTab("macros")} />
      </View>

      <Text style={styles.homeInsight}>{stats.insight}</Text>
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

function MacroForm({
  macros,
  saving,
  saveMacro
}: {
  macros: MacroLog[];
  saving: boolean;
  saveMacro: (values: Omit<MacroLog, "id" | "user_id" | "created_at">) => Promise<boolean>;
}) {
  const today = dateKey(new Date());
  const todayLog = macros.find((log) => log.logged_date === today);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [water, setWater] = useState("");
  const [sodium, setSodium] = useState("");
  const [bodyWeight, setBodyWeight] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!todayLog) {
      return;
    }

    setCalories(String(todayLog.calories));
    setProtein(String(todayLog.protein_g));
    setCarbs(String(todayLog.carbs_g));
    setFat(String(todayLog.fat_g));
    setWater(String(todayLog.water_oz));
    setSodium(String(todayLog.sodium_mg));
    setBodyWeight(String(todayLog.body_weight_lb));
    setNotes(todayLog.notes ?? "");
  }, [todayLog?.id]);

  async function submit() {
    const required = [calories, protein, carbs, fat, water, sodium, bodyWeight];
    if (!required.every(nonNegativeNumber)) {
      Alert.alert("Check macros", "Use zero or greater for calories, macros, water, sodium, and body weight.");
      return;
    }

    const saved = await saveMacro({
      calories: Number(calories),
      protein_g: Number(protein),
      carbs_g: Number(carbs),
      fat_g: Number(fat),
      water_oz: Number(water),
      sodium_mg: Number(sodium),
      body_weight_lb: Number(bodyWeight),
      notes: notes.trim() || null,
      logged_date: today
    });

    if (saved) {
      Alert.alert("Macros saved", "Today's nutrition log is updated.");
    }
  }

  return (
    <View style={styles.stack}>
      <SectionTitle title="Macro Log" subtitle="Daily nutrition, hydration, sodium, and body weight." />
      <Card>
        <Text style={styles.cardTitle}>Today</Text>
        <View style={styles.statGrid}>
          <StatCard label="Calories" value={todayLog ? todayLog.calories : "-"} />
          <StatCard label="Protein" value={todayLog ? `${todayLog.protein_g}g` : "-"} />
          <StatCard label="Weight" value={todayLog ? `${todayLog.body_weight_lb} lb` : "-"} />
          <StatCard label="Water" value={todayLog ? `${todayLog.water_oz} oz` : "-"} />
        </View>
      </Card>
      <Card>
        <Text style={styles.cardTitle}>{todayLog ? "Edit Today's Macros" : "Log Today's Macros"}</Text>
        <Field label="Calories" keyboardType="number-pad" inputStyle={styles.macroInput} onChangeText={setCalories} value={calories} />
        <View style={styles.row}>
          <Field label="Protein g" keyboardType="decimal-pad" inputStyle={styles.macroInput} onChangeText={setProtein} value={protein} />
          <Field label="Carbs g" keyboardType="decimal-pad" inputStyle={styles.macroInput} onChangeText={setCarbs} value={carbs} />
        </View>
        <View style={styles.row}>
          <Field label="Fat g" keyboardType="decimal-pad" inputStyle={styles.macroInput} onChangeText={setFat} value={fat} />
          <Field label="Water oz" keyboardType="decimal-pad" inputStyle={styles.macroInput} onChangeText={setWater} value={water} />
        </View>
        <View style={styles.row}>
          <Field label="Sodium mg" keyboardType="number-pad" inputStyle={styles.macroInput} onChangeText={setSodium} value={sodium} />
          <Field label="Body weight lb" keyboardType="decimal-pad" inputStyle={styles.macroInput} onChangeText={setBodyWeight} value={bodyWeight} />
        </View>
        <Field label="Notes" multiline onChangeText={setNotes} value={notes} placeholder="Training day, appetite, meals..." />
        <PrimaryButton loading={saving} onPress={submit} title="Save Macros" />
      </Card>
    </View>
  );
}

function CoachingScreen({ session }: { session: Session }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [links, setLinks] = useState<CoachClientLink[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, UserProfile>>({});
  const [clientData, setClientData] = useState<DashboardData | null>(null);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [clientLoading, setClientLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const userEmail = session.user.email?.toLowerCase() ?? "";

  const loadCoaching = useCallback(async () => {
    setLoading(true);
    const { data: profileRow, error: profileError } = await supabase
      .from("user_profiles")
      .upsert({ id: session.user.id, email: userEmail }, { onConflict: "id" })
      .select("*")
      .single();

    if (profileError) {
      setErrorMessage(profileError.message);
      setLoading(false);
      return;
    }

    const { data: linkRows, error: linksError } = await supabase
      .from("coach_client_links")
      .select("*")
      .order("created_at", { ascending: false });

    if (linksError) {
      setErrorMessage(linksError.message);
      setLoading(false);
      return;
    }

    const profileIds = Array.from(
      new Set(
        ((linkRows ?? []) as CoachClientLink[])
          .flatMap((link) => [link.coach_id, link.client_id])
          .filter((id): id is string => Boolean(id))
          .filter((id) => id !== session.user.id)
      )
    );

    let profileLookup: Record<string, UserProfile> = {};
    if (profileIds.length > 0) {
      const { data: relatedProfiles, error: relatedProfilesError } = await supabase
        .from("user_profiles")
        .select("*")
        .in("id", profileIds);

      if (relatedProfilesError) {
        setErrorMessage(relatedProfilesError.message);
        setLoading(false);
        return;
      }

      profileLookup = ((relatedProfiles ?? []) as UserProfile[]).reduce<Record<string, UserProfile>>((lookup, item) => {
        lookup[item.id] = item;
        return lookup;
      }, {});
    }

    setErrorMessage("");
    setProfile(profileRow as UserProfile);
    setLinks((linkRows ?? []) as CoachClientLink[]);
    setProfilesById(profileLookup);
    setLoading(false);
  }, [session.user.id, userEmail]);

  useEffect(() => {
    loadCoaching();
  }, [loadCoaching]);

  async function updateRole(role: UserProfile["role"]) {
    setSaving(true);
    const { error } = await supabase.from("user_profiles").update({ role }).eq("id", session.user.id);
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      Alert.alert("Profile update failed", error.message);
      return;
    }

    await loadCoaching();
  }

  async function inviteClient() {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      Alert.alert("Check invite", "Enter a valid client email.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("coach_client_links").insert({
      coach_id: session.user.id,
      invited_email: normalizedEmail,
      status: "pending"
    });
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      Alert.alert("Invite failed", error.message);
      return;
    }

    setInviteEmail("");
    setErrorMessage("");
    await loadCoaching();
  }

  async function updateInvite(link: CoachClientLink, status: "accepted" | "rejected" | "revoked") {
    const values =
      status === "accepted"
        ? { status, client_id: session.user.id, accepted_at: new Date().toISOString() }
        : status === "rejected"
          ? { status, client_id: session.user.id }
          : { status, revoked_at: new Date().toISOString() };

    setSaving(true);
    const { error } = await supabase.from("coach_client_links").update(values).eq("id", link.id);
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      Alert.alert("Coaching update failed", error.message);
      return;
    }

    setErrorMessage("");
    await loadCoaching();
  }

  async function openClient(client: UserProfile) {
    setSelectedClient(client);
    setClientLoading(true);
    setClientData(null);
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [workouts, restPeriods, recovery, checkins, macros] = await Promise.all([
      supabase.from("workout_logs").select("*").eq("user_id", client.id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("rest_periods").select("*").eq("user_id", client.id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("recovery_logs").select("*").eq("user_id", client.id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("daily_checkins").select("*").eq("user_id", client.id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("macro_logs").select("*").eq("user_id", client.id).gte("logged_date", dateKey(since)).order("logged_date", { ascending: false })
    ]);

    setClientLoading(false);

    const firstError = workouts.error || restPeriods.error || recovery.error || checkins.error || macros.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      Alert.alert("Client logs failed to load", firstError.message);
      return;
    }

    setErrorMessage("");
    setClientData({
      workouts: (workouts.data ?? []) as WorkoutLog[],
      restPeriods: (restPeriods.data ?? []) as RestPeriod[],
      recovery: (recovery.data ?? []) as RecoveryLog[],
      checkins: (checkins.data ?? []) as DailyCheckIn[],
      macros: (macros.data ?? []) as MacroLog[]
    });
  }

  const pendingInvites = links.filter((link) => link.status === "pending" && link.invited_email.toLowerCase() === userEmail);
  const connectedCoaches = links.filter((link) => link.status === "accepted" && link.client_id === session.user.id);
  const connectedClients = links.filter((link) => link.status === "accepted" && link.coach_id === session.user.id && link.client_id);
  const sentInvites = links.filter((link) => link.coach_id === session.user.id);
  const canCoach = profile?.role === "coach" || profile?.role === "both";
  const canClient = profile?.role === "client" || profile?.role === "both";

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.stack}>
      <SectionTitle title="Coaching" subtitle="Connect with coaches or clients for read-only accountability." />
      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>Supabase error</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Your Role</Text>
        <Text style={styles.cardCopy}>Choose how you use The Forge. You can coach, be coached, or do both.</Text>
        <View style={styles.roleGrid}>
          <RoleButton active={profile?.role === "client"} title="Client" onPress={() => updateRole("client")} />
          <RoleButton active={profile?.role === "coach"} title="Coach" onPress={() => updateRole("coach")} />
          <RoleButton active={profile?.role === "both"} title="Both" onPress={() => updateRole("both")} />
        </View>
      </Card>

      {canClient ? (
        <Card>
          <Text style={styles.cardTitle}>Client Access</Text>
          {pendingInvites.length === 0 ? <Text style={styles.cardCopy}>No pending coach invites.</Text> : null}
          {pendingInvites.map((link) => (
            <View key={link.id} style={styles.coachingItem}>
              <View style={styles.logHeaderText}>
                <Text style={styles.logTitle}>{profilesById[link.coach_id]?.email ?? "Coach invite"}</Text>
                <Text style={styles.logDate}>Wants read-only access to your logs.</Text>
              </View>
              <View style={styles.logActions}>
                <Pressable disabled={saving} onPress={() => updateInvite(link, "accepted")} style={styles.secondaryAction}>
                  <Text style={styles.secondaryActionText}>Accept</Text>
                </Pressable>
                <Pressable disabled={saving} onPress={() => updateInvite(link, "rejected")} style={styles.deleteAction}>
                  <Text style={styles.deleteActionText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {connectedCoaches.length > 0 ? <Text style={styles.homeEyebrow}>Connected Coaches</Text> : null}
          {connectedCoaches.map((link) => (
            <View key={link.id} style={styles.coachingItem}>
              <View style={styles.logHeaderText}>
                <Text style={styles.logTitle}>{profilesById[link.coach_id]?.email ?? "Connected coach"}</Text>
                <Text style={styles.logDate}>Read-only access granted.</Text>
              </View>
              <Pressable disabled={saving} onPress={() => updateInvite(link, "revoked")} style={styles.deleteAction}>
                <Text style={styles.deleteActionText}>Remove Access</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}

      {canCoach ? (
        <Card>
          <Text style={styles.cardTitle}>Coach Tools</Text>
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            label="Invite client by email"
            onChangeText={setInviteEmail}
            placeholder="client@example.com"
            placeholderTextColor="#b8b8c0"
            value={inviteEmail}
          />
          <PrimaryButton loading={saving} onPress={inviteClient} title="Send Coach Invite" />

          <Text style={styles.homeEyebrow}>Connected Clients</Text>
          {connectedClients.length === 0 ? <Text style={styles.cardCopy}>No accepted clients yet.</Text> : null}
          {connectedClients.map((link) => {
            const client = link.client_id ? profilesById[link.client_id] : null;
            return (
              <Pressable
                key={link.id}
                onPress={() => client && openClient(client)}
                style={({ pressed }) => [styles.coachingItem, pressed && styles.coachingItemPressed]}
              >
                <Text style={styles.logTitle}>{client?.display_name || client?.email || link.invited_email}</Text>
                <Text style={styles.logDate}>Tap to view read-only client dashboard</Text>
              </Pressable>
            );
          })}

          <Text style={styles.homeEyebrow}>Invites Sent</Text>
          {sentInvites.length === 0 ? <Text style={styles.cardCopy}>No invites sent yet.</Text> : null}
          {sentInvites.map((link) => (
            <View key={link.id} style={styles.inviteRow}>
              <Text style={styles.logRowValue}>{link.invited_email}</Text>
              <Text style={styles.statusPill}>{link.status}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {selectedClient ? (
        <ClientDashboard
          client={selectedClient}
          data={clientData}
          loading={clientLoading}
          onClose={() => {
            setSelectedClient(null);
            setClientData(null);
          }}
        />
      ) : null}
    </View>
  );
}

function RoleButton({ active, onPress, title }: { active: boolean; onPress: () => void; title: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.roleButton, active && styles.roleButtonActive]}>
      <Text style={[styles.roleButtonText, active && styles.roleButtonTextActive]}>{title}</Text>
    </Pressable>
  );
}

function ClientDashboard({
  client,
  data,
  loading,
  onClose
}: {
  client: UserProfile;
  data: DashboardData | null;
  loading: boolean;
  onClose: () => void;
}) {
  const stats = useMemo(() => buildStats(data ?? emptyData), [data]);
  const charts = useMemo(() => buildChartData(data ?? emptyData), [data]);

  return (
    <Card>
      <View style={styles.homeCardHeader}>
        <View>
          <Text style={styles.homeEyebrow}>Client Dashboard</Text>
          <Text style={styles.cardTitle}>{client.display_name || client.email}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.modalClose}>
          <Text style={styles.modalCloseText}>Close</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={styles.cardCopy}>Loading client logs...</Text>
      ) : data ? (
        <>
          <View style={styles.statGrid}>
            <StatCard label="Workouts" value={stats.workouts} />
            <StatCard label="Volume" value={`${stats.volume} lb`} />
            <StatCard label="Sauna" value={`${stats.saunaMinutes} min`} />
            <StatCard label="Cold" value={`${stats.plungeMinutes} min`} />
            <StatCard label="Avg energy" value={stats.avgEnergy} />
            <StatCard label="Avg rest" value={stats.avgRestTime} />
          </View>
          <ChartCard title="Training Trend" subtitle="Client volume over the last 7 days" points={charts.trainingVolume} variant="bar" unit="lb" />
          <ChartCard
            title="Readiness Trend"
            subtitle="Energy and sleep over the last 7 days"
            points={charts.readinessScores}
            variant="line"
            unit="/10"
            primaryLabel="Energy"
            secondaryLabel="Sleep"
          />
          <LogPreview title="Training Logs" empty="No workouts this week." rows={data.workouts.map((log) => `${log.exercise} | ${log.sets} x ${log.reps} @ ${log.weight} lb`)} />
          <LogPreview
            title="Recovery Logs"
            empty="No recovery sessions this week."
            rows={data.recovery.map((log) => `${log.recovery_type === "sauna" ? "Sauna" : "Cold plunge"} | ${log.duration_minutes} min`)}
          />
          <LogPreview title="Check-ins" empty="No check-ins this week." rows={data.checkins.map((log) => `Energy ${log.energy}/10 | Sleep ${log.sleep}/10 | Soreness ${log.soreness}/10`)} />
          <LogPreview title="Macro Logs" empty="No macro logs this week." rows={data.macros.map((log) => `${log.logged_date} | ${log.calories} cal | ${log.protein_g}g protein`)} />
        </>
      ) : (
        <Text style={styles.cardCopy}>Select a client to load their read-only dashboard.</Text>
      )}
    </Card>
  );
}

function LogPreview({ empty, rows, title }: { empty: string; rows: string[]; title: string }) {
  return (
    <View style={styles.previewBlock}>
      <Text style={styles.homeEyebrow}>{title}</Text>
      {rows.length === 0 ? <Text style={styles.cardCopy}>{empty}</Text> : null}
      {rows.slice(0, 5).map((row, index) => (
        <View key={`${title}-${index}`} style={styles.previewRow}>
          <Text style={styles.logRowValue}>{row}</Text>
        </View>
      ))}
    </View>
  );
}

function StatsPanel({
  data,
  stats,
  openDetail
}: {
  data: DashboardData;
  stats: ReturnType<typeof buildStats>;
  openDetail: (detail: DetailKey) => void;
}) {
  const [category, setCategory] = useState<StatsCategory>("training");
  const charts = useMemo(() => buildChartData(data), [data]);

  return (
    <View style={styles.stack}>
      <SectionTitle title="Performance" subtitle="Choose a lane, then tap any card to inspect and edit the logs underneath." />
      <View style={styles.statsTabs}>
        {(["training", "recovery", "readiness", "macros"] as StatsCategory[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => setCategory(item)}
            style={[styles.statsTab, category === item && styles.statsTabActive]}
          >
            <Text style={[styles.statsTabText, category === item && styles.statsTabTextActive]}>{categoryLabel(item)}</Text>
          </Pressable>
        ))}
      </View>

      {category === "training" ? (
        <>
          <Text style={styles.statsSectionHeader}>Training</Text>
          <View style={styles.statGrid}>
            <StatCard label="Workouts this week" value={stats.workouts} onPress={() => openDetail("workouts")} />
            <StatCard label="Total volume" value={`${stats.volume} lb`} onPress={() => openDetail("volume")} />
            <StatCard label="Avg rest" value={stats.avgRestTime} onPress={() => openDetail("avgRest")} />
            <StatCard label="Longest rest" value={stats.longestRestTime} onPress={() => openDetail("longestRest")} />
            <StatCard label="Shortest rest" value={stats.shortestRestTime} onPress={() => openDetail("shortestRest")} />
          </View>
          <ChartCard title="Volume Trend" subtitle="Training volume over the last 7 days" points={charts.trainingVolume} variant="bar" unit="lb" />
        </>
      ) : null}

      {category === "recovery" ? (
        <>
          <Text style={styles.statsSectionHeader}>Recovery</Text>
          <View style={styles.statGrid}>
            <StatCard label="Sauna total" value={`${stats.saunaMinutes} min`} onPress={() => openDetail("sauna")} />
            <StatCard label="Cold total" value={`${stats.plungeMinutes} min`} onPress={() => openDetail("cold")} />
            <StatCard label="Recovery sessions" value={data.recovery.length} onPress={() => openDetail("recovery")} />
          </View>
          <ChartCard
            title="Heat / Cold Minutes"
            subtitle="Sauna and cold plunge minutes over the last 7 days"
            points={charts.recoveryMinutes}
            variant="groupedBar"
            unit="min"
            primaryLabel="Sauna"
            secondaryLabel="Cold"
          />
        </>
      ) : null}

      {category === "readiness" ? (
        <>
          <Text style={styles.statsSectionHeader}>Readiness</Text>
          <View style={styles.statGrid}>
            <StatCard label="Avg energy" value={stats.avgEnergy} onPress={() => openDetail("energy")} />
            <StatCard label="Avg sleep" value={stats.avgSleep} onPress={() => openDetail("sleep")} />
            <StatCard label="Avg soreness" value={stats.avgSoreness} onPress={() => openDetail("soreness")} />
            <StatCard label="Avg motivation" value={stats.avgMotivation} onPress={() => openDetail("motivation")} />
          </View>
          <ChartCard
            title="Energy / Sleep"
            subtitle="Readiness scores over the last 7 days"
            points={charts.readinessScores}
            variant="line"
            unit="/10"
            primaryLabel="Energy"
            secondaryLabel="Sleep"
          />
        </>
      ) : null}

      {category === "macros" ? (
        <>
          <Text style={styles.statsSectionHeader}>Macros</Text>
          <View style={styles.statGrid}>
            <StatCard label="Avg calories" value={stats.avgCalories} onPress={() => openDetail("macroCalories")} />
            <StatCard label="Avg protein" value={stats.avgProtein} onPress={() => openDetail("macroProtein")} />
            <StatCard label="Avg carbs" value={stats.avgCarbs} onPress={() => openDetail("macroCarbs")} />
            <StatCard label="Avg fat" value={stats.avgFat} onPress={() => openDetail("macroFat")} />
            <StatCard label="Avg body weight" value={stats.avgBodyWeight} onPress={() => openDetail("macroWeight")} />
            <StatCard label="Avg water" value={stats.avgWater} onPress={() => openDetail("macroWater")} />
            <StatCard label="Avg sodium" value={stats.avgSodium} onPress={() => openDetail("macroSodium")} />
          </View>
          <ChartCard title="Calories" subtitle="Calories over the last 7 days" points={charts.calories} variant="line" />
          <ChartCard title="Protein" subtitle="Protein grams over the last 7 days" points={charts.protein} variant="bar" unit="g" />
          <ChartCard title="Body Weight" subtitle="Body weight over the last 7 days" points={charts.bodyWeight} variant="line" unit="lb" />
        </>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Key insight</Text>
        <Text style={styles.cardCopy}>{stats.insight}</Text>
      </Card>
    </View>
  );
}

function ChartCard({
  points,
  primaryLabel,
  secondaryLabel,
  subtitle,
  title,
  unit = "",
  variant
}: {
  points: ChartPoint[];
  primaryLabel?: string;
  secondaryLabel?: string;
  subtitle: string;
  title: string;
  unit?: string;
  variant: "bar" | "groupedBar" | "line";
}) {
  const hasData = points.some((point) => point.value > 0 || Number(point.secondaryValue ?? 0) > 0);

  return (
    <Card>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartTitle}>{title}</Text>
          <Text style={styles.chartSubtitle}>{subtitle}</Text>
        </View>
        {(primaryLabel || secondaryLabel) && hasData ? (
          <View style={styles.chartLegend}>
            {primaryLabel ? <LegendItem color={colors.accent} label={primaryLabel} /> : null}
            {secondaryLabel ? <LegendItem color={colors.muted} label={secondaryLabel} /> : null}
          </View>
        ) : null}
      </View>
      {hasData ? (
        <TrendChart points={points} unit={unit} variant={variant} />
      ) : (
        <View style={styles.chartEmpty}>
          <Text style={styles.emptyTitle}>Not enough data yet</Text>
          <Text style={styles.emptyText}>Log a few entries this week and this chart will start drawing the trend.</Text>
        </View>
      )}
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function TrendChart({
  points,
  unit,
  variant
}: {
  points: ChartPoint[];
  unit: string;
  variant: "bar" | "groupedBar" | "line";
}) {
  const width = 320;
  const height = 170;
  const left = 34;
  const right = 12;
  const top = 16;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.value, Number(point.secondaryValue ?? 0)]));
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const barSlot = plotWidth / points.length;

  const yFor = (value: number) => top + plotHeight - (value / maxValue) * plotHeight;
  const xFor = (index: number) => left + index * xStep;
  const pathFor = (key: "value" | "secondaryValue") =>
    points
      .map((point, index) => `${xFor(index)},${yFor(Number(point[key] ?? 0))}`)
      .join(" ");

  return (
    <Svg height={height} style={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} width="100%">
      <Line x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} stroke={colors.border} strokeWidth="1" />
      <Line x1={left} x2={width - right} y1={top + plotHeight / 2} y2={top + plotHeight / 2} stroke={colors.border} strokeWidth="1" opacity="0.55" />
      <SvgText fill={colors.muted} fontSize="10" fontWeight="700" x={left} y={12}>
        {Math.round(maxValue)}
        {unit}
      </SvgText>
      {points.map((point, index) => {
        const x = variant === "line" ? xFor(index) : left + index * barSlot + barSlot * 0.18;
        const primaryHeight = plotHeight - (yFor(point.value) - top);
        const secondaryHeight = plotHeight - (yFor(Number(point.secondaryValue ?? 0)) - top);

        return (
          <G key={point.label}>
            {variant === "bar" ? (
              <Rect
                fill={colors.accent}
                height={Math.max(2, primaryHeight)}
                rx="3"
                width={barSlot * 0.54}
                x={x}
                y={top + plotHeight - Math.max(2, primaryHeight)}
              />
            ) : null}
            {variant === "groupedBar" ? (
              <>
                <Rect
                  fill={colors.accent}
                  height={Math.max(2, primaryHeight)}
                  rx="3"
                  width={barSlot * 0.25}
                  x={x}
                  y={top + plotHeight - Math.max(2, primaryHeight)}
                />
                <Rect
                  fill={colors.muted}
                  height={Math.max(2, secondaryHeight)}
                  rx="3"
                  width={barSlot * 0.25}
                  x={x + barSlot * 0.32}
                  y={top + plotHeight - Math.max(2, secondaryHeight)}
                />
              </>
            ) : null}
            <SvgText fill={colors.muted} fontSize="10" fontWeight="700" textAnchor="middle" x={left + index * barSlot + barSlot / 2} y={height - 13}>
              {point.label}
            </SvgText>
          </G>
        );
      })}
      {variant === "line" ? (
        <>
          <Polyline fill="none" points={pathFor("value")} stroke={colors.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {points.some((point) => point.secondaryValue !== undefined) ? (
            <Polyline fill="none" points={pathFor("secondaryValue")} stroke={colors.muted} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          ) : null}
          {points.map((point, index) => (
            <G key={`${point.label}-dots`}>
              <Circle cx={xFor(index)} cy={yFor(point.value)} fill={colors.accent} r="4" />
              {point.secondaryValue !== undefined ? <Circle cx={xFor(index)} cy={yFor(point.secondaryValue)} fill={colors.muted} r="4" /> : null}
            </G>
          ))}
        </>
      ) : null}
    </Svg>
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
  | { kind: "checkin"; log: DailyCheckIn; focus: "energy" | "sleep" | "soreness" | "motivation" }
  | { kind: "rest"; log: RestPeriod }
  | { kind: "macro"; log: MacroLog };

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

  if (detailKey === "recovery") {
    return {
      title: "Recovery logs",
      items: data.recovery.map((log) => ({ kind: "recovery", log }))
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

  if (detailKey === "energy" || detailKey === "sleep" || detailKey === "soreness" || detailKey === "motivation") {
    const titles = {
      energy: "Energy check-ins",
      sleep: "Sleep check-ins",
      soreness: "Soreness check-ins",
      motivation: "Motivation check-ins"
    };

    return {
      title: titles[detailKey],
      items: data.checkins.map((log) => ({ kind: "checkin", log, focus: detailKey }))
    };
  }

  if (detailKey.startsWith("macro")) {
    const calories = data.macros.map((log) => Number(log.calories));
    const high = calories.length > 0 ? Math.max(...calories) : null;
    const low = calories.length > 0 ? Math.min(...calories) : null;
    const macroLogs =
      detailKey === "macroHighCalories" && high !== null
        ? data.macros.filter((log) => Number(log.calories) === high)
        : detailKey === "macroLowCalories" && low !== null
          ? data.macros.filter((log) => Number(log.calories) === low)
          : data.macros;
    const titles: Record<string, string> = {
      macroCalories: "Calories history",
      macroProtein: "Protein history",
      macroCarbs: "Carbs history",
      macroFat: "Fat history",
      macroWater: "Water history",
      macroSodium: "Sodium history",
      macroWeight: "Body weight history",
      macroHighCalories: "Highest calorie day",
      macroLowCalories: "Lowest calorie day"
    };

    return {
      title: titles[detailKey],
      items: macroLogs.map((log) => ({ kind: "macro", log }))
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

  const restKey = detailKey as "avgRest" | "longestRest" | "shortestRest" | "totalRest";

  return {
    title: titles[restKey],
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

  if (item.kind === "macro") {
    return {
      calories: String(item.log.calories),
      protein_g: String(item.log.protein_g),
      carbs_g: String(item.log.carbs_g),
      fat_g: String(item.log.fat_g),
      water_oz: String(item.log.water_oz),
      sodium_mg: String(item.log.sodium_mg),
      body_weight_lb: String(item.log.body_weight_lb),
      logged_date: item.log.logged_date,
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

  if (item.kind === "macro") {
    return (
      <>
        <Field label="Calories" keyboardType="number-pad" onChangeText={(value) => updateField("calories", value)} value={fields.calories} />
        <View style={styles.row}>
          <Field label="Protein g" keyboardType="decimal-pad" onChangeText={(value) => updateField("protein_g", value)} value={fields.protein_g} />
          <Field label="Carbs g" keyboardType="decimal-pad" onChangeText={(value) => updateField("carbs_g", value)} value={fields.carbs_g} />
        </View>
        <View style={styles.row}>
          <Field label="Fat g" keyboardType="decimal-pad" onChangeText={(value) => updateField("fat_g", value)} value={fields.fat_g} />
          <Field label="Water oz" keyboardType="decimal-pad" onChangeText={(value) => updateField("water_oz", value)} value={fields.water_oz} />
        </View>
        <View style={styles.row}>
          <Field label="Sodium mg" keyboardType="number-pad" onChangeText={(value) => updateField("sodium_mg", value)} value={fields.sodium_mg} />
          <Field label="Weight lb" keyboardType="decimal-pad" onChangeText={(value) => updateField("body_weight_lb", value)} value={fields.body_weight_lb} />
        </View>
        <Field label="Logged date" onChangeText={(value) => updateField("logged_date", value)} value={fields.logged_date} />
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

  if (item.kind === "macro") {
    const numericFields = ["calories", "protein_g", "carbs_g", "fat_g", "water_oz", "sodium_mg", "body_weight_lb"];
    if (!numericFields.every((field) => nonNegativeNumber(fields[field])) || !fields.logged_date.trim()) {
      Alert.alert("Check macros", "Macro values must be zero or greater, and logged date is required.");
      return null;
    }

    return {
      calories: Number(fields.calories),
      protein_g: Number(fields.protein_g),
      carbs_g: Number(fields.carbs_g),
      fat_g: Number(fields.fat_g),
      water_oz: Number(fields.water_oz),
      sodium_mg: Number(fields.sodium_mg),
      body_weight_lb: Number(fields.body_weight_lb),
      logged_date: fields.logged_date.trim(),
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
    const checkinTitles = {
      energy: `Energy ${item.log.energy}/10`,
      sleep: `Sleep ${item.log.sleep}/10`,
      soreness: `Soreness ${item.log.soreness}/10`,
      motivation: `Motivation ${item.log.motivation}/10`
    };

    return {
      createdAt: item.log.created_at,
      id: item.log.id,
      table: "daily_checkins" as EditableTable,
      title: checkinTitles[item.focus],
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

  if (item.kind === "macro") {
    return {
      createdAt: item.log.created_at,
      id: item.log.id,
      table: "macro_logs" as EditableTable,
      title: `${item.log.logged_date} macros`,
      rows: [
        { label: "Calories", value: String(item.log.calories) },
        { label: "Protein", value: `${item.log.protein_g}g` },
        { label: "Carbs", value: `${item.log.carbs_g}g` },
        { label: "Fat", value: `${item.log.fat_g}g` },
        { label: "Water", value: `${item.log.water_oz} oz` },
        { label: "Sodium", value: `${item.log.sodium_mg} mg` },
        { label: "Body weight", value: `${item.log.body_weight_lb} lb` },
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

function HomeMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.homeMetric}>
      <Text style={styles.homeMetricValue}>{value}</Text>
      <Text style={styles.homeMetricLabel}>{label}</Text>
    </View>
  );
}

function getSuggestedAction(hasCheckIn: boolean, hasMacros: boolean, hasWorkout: boolean) {
  if (!hasCheckIn) {
    return {
      title: "Check in first",
      copy: "Capture energy, sleep, soreness, and motivation before choosing the day's load."
    };
  }

  if (!hasMacros) {
    return {
      title: "Set the fuel",
      copy: "Log macros early so training and recovery have a real target."
    };
  }

  if (!hasWorkout) {
    return {
      title: "Log the work",
      copy: "Start with the first lift and let the rest timer keep the session honest."
    };
  }

  return {
    title: "Recover with intent",
    copy: "Round out the day with sauna, cold plunge, or a note your future self can use."
  };
}

function buildChartData(data: DashboardData) {
  const days = lastSevenDays();

  return {
    trainingVolume: days.map((day) => ({
      label: day.label,
      value: sumValues(
        data.workouts.filter((log) => dateKey(new Date(log.created_at)) === day.key),
        (log) => Number(log.sets) * Number(log.reps) * Number(log.weight)
      )
    })),
    recoveryMinutes: days.map((day) => {
      const logs = data.recovery.filter((log) => dateKey(new Date(log.created_at)) === day.key);
      return {
        label: day.label,
        value: sumValues(
          logs.filter((log) => log.recovery_type === "sauna"),
          (log) => Number(log.duration_minutes)
        ),
        secondaryValue: sumValues(
          logs.filter((log) => log.recovery_type === "cold_plunge"),
          (log) => Number(log.duration_minutes)
        )
      };
    }),
    readinessScores: days.map((day) => {
      const logs = data.checkins.filter((log) => dateKey(new Date(log.created_at)) === day.key);
      return {
        label: day.label,
        value: averageNumber(logs.map((log) => log.energy)),
        secondaryValue: averageNumber(logs.map((log) => log.sleep))
      };
    }),
    calories: days.map((day) => ({
      label: day.label,
      value: sumValues(
        data.macros.filter((log) => log.logged_date === day.key),
        (log) => Number(log.calories)
      )
    })),
    protein: days.map((day) => ({
      label: day.label,
      value: sumValues(
        data.macros.filter((log) => log.logged_date === day.key),
        (log) => Number(log.protein_g)
      )
    })),
    bodyWeight: days.map((day) => ({
      label: day.label,
      value: averageNumber(data.macros.filter((log) => log.logged_date === day.key).map((log) => log.body_weight_lb))
    }))
  };
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));

    return {
      key: dateKey(date),
      label: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)
    };
  });
}

function sumValues<T>(items: T[], valueFor: (item: T) => number) {
  return items.reduce((total, item) => total + valueFor(item), 0);
}

function averageNumber(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + Number(value), 0) / values.length;
}

function categoryLabel(category: StatsCategory) {
  const labels: Record<StatsCategory, string> = {
    training: "Training",
    recovery: "Recovery",
    readiness: "Readiness",
    macros: "Macros"
  };

  return labels[category];
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
  const avgMotivation = average(data.checkins.map((log) => log.motivation));
  const restDurations = data.restPeriods.map((rest) => Number(rest.duration_seconds));
  const avgRest = averageSeconds(restDurations);
  const longestRest = restDurations.length > 0 ? Math.max(...restDurations) : null;
  const shortestRest = restDurations.length > 0 ? Math.min(...restDurations) : null;
  const totalRest = restDurations.reduce((total, duration) => total + duration, 0);
  const todayMacro = data.macros.find((log) => log.logged_date === dateKey(new Date()));
  const calorieValues = data.macros.map((log) => Number(log.calories));
  const highestCalories = calorieValues.length > 0 ? Math.max(...calorieValues) : null;
  const lowestCalories = calorieValues.length > 0 ? Math.min(...calorieValues) : null;

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
    todayCalories: todayMacro ? todayMacro.calories : "-",
    todayProtein: todayMacro ? `${todayMacro.protein_g}g` : "-",
    todayBodyWeight: todayMacro ? `${todayMacro.body_weight_lb} lb` : "-",
    avgCalories: averageMacro(data.macros.map((log) => log.calories), ""),
    avgProtein: averageMacro(data.macros.map((log) => log.protein_g), "g"),
    avgCarbs: averageMacro(data.macros.map((log) => log.carbs_g), "g"),
    avgFat: averageMacro(data.macros.map((log) => log.fat_g), "g"),
    avgWater: averageMacro(data.macros.map((log) => log.water_oz), " oz"),
    avgSodium: averageMacro(data.macros.map((log) => log.sodium_mg), " mg"),
    avgBodyWeight: averageMacro(data.macros.map((log) => log.body_weight_lb), " lb"),
    highestCalories: highestCalories === null ? "-" : highestCalories,
    lowestCalories: lowestCalories === null ? "-" : lowestCalories,
    avgEnergy,
    avgSleep,
    avgSoreness,
    avgMotivation,
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

function nonNegativeNumber(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function averageMacro(values: number[], suffix: string) {
  if (values.length === 0) {
    return "-";
  }

  const averaged = Math.round((values.reduce((total, value) => total + Number(value), 0) / values.length) * 10) / 10;
  return `${averaged}${suffix}`;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isFormTab(tab: TabKey) {
  return tab === "workout" || tab === "recovery" || tab === "checkin" || tab === "macros";
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
  keyboardArea: {
    flex: 1
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
  formContent: {
    paddingBottom: 112
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
  statsTabs: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 6
  },
  statsTab: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    paddingVertical: 10
  },
  statsTabActive: {
    backgroundColor: colors.accent
  },
  statsTabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  statsTabTextActive: {
    color: "#111111"
  },
  statsSectionHeader: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase"
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
  homeCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  homeEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  homeDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  homeLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "900"
  },
  homeHeroValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31
  },
  homeMetricRow: {
    flexDirection: "row",
    gap: 10
  },
  homeMetric: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 12
  },
  homeMetricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  homeMetricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
    textTransform: "uppercase"
  },
  homeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  homeInsight: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center"
  },
  roleGrid: {
    flexDirection: "row",
    gap: 10
  },
  roleButton: {
    alignItems: "center",
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12
  },
  roleButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  roleButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  roleButtonTextActive: {
    color: "#111111"
  },
  coachingItem: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  coachingItemPressed: {
    borderColor: colors.accent,
    opacity: 0.82
  },
  inviteRow: {
    alignItems: "center",
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12
  },
  statusPill: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  previewBlock: {
    gap: 8
  },
  previewRow: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10
  },
  quickActions: {
    gap: 10
  },
  miniAction: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: "47%",
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
  macroInput: {
    backgroundColor: "#252529",
    borderColor: "#686871",
    borderWidth: 1.5,
    fontSize: 18,
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  chartHeader: {
    gap: 10
  },
  chartTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  chartSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  chartLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    width: 8
  },
  legendText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  chartSvg: {
    marginTop: 4
  },
  chartEmpty: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
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
