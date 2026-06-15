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
import { ColdPlungeLog, DailyCheckIn, SaunaLog, TabKey, WorkoutLog } from "../types/logs";

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
  saunas: SaunaLog[];
  plunges: ColdPlungeLog[];
  checkins: DailyCheckIn[];
};

const emptyData: DashboardData = {
  workouts: [],
  saunas: [],
  plunges: [],
  checkins: []
};

export function DashboardScreen({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [workouts, saunas, plunges, checkins] = await Promise.all([
      supabase.from("workout_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("sauna_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("cold_plunge_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("daily_checkins").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false })
    ]);

    setRefreshing(false);

    const firstError = workouts.error || saunas.error || plunges.error || checkins.error;
    if (firstError) {
      Alert.alert("Could not load logs", firstError.message);
      return;
    }

    setData({
      workouts: (workouts.data ?? []) as WorkoutLog[],
      saunas: (saunas.data ?? []) as SaunaLog[],
      plunges: (plunges.data ?? []) as ColdPlungeLog[],
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
      Alert.alert("Save failed", error.message);
      return false;
    }

    Alert.alert("Logged", forgeTips[Math.floor(Math.random() * forgeTips.length)]);
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
        {activeTab === "home" ? <Home stats={stats} setActiveTab={setActiveTab} /> : null}
        {activeTab === "workout" ? <WorkoutForm saving={saving} saveRow={saveRow} /> : null}
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
  saveRow
}: {
  saving: boolean;
  saveRow: (table: string, values: Record<string, string | number | null>) => Promise<boolean>;
}) {
  const [exercise, setExercise] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    if (!exercise.trim() || !positiveNumber(sets) || !positiveNumber(reps) || Number(weight || 0) < 0) {
      Alert.alert("Missing lift details", "Add an exercise, sets, reps, and a valid weight.");
      return;
    }

    const saved = await saveRow("workout_logs", {
      exercise: exercise.trim(),
      sets: Number(sets),
      reps: Number(reps),
      weight: Number(weight || 0),
      notes: notes.trim() || null
    });

    if (saved) {
      setExercise("");
      setSets("");
      setReps("");
      setWeight("");
      setNotes("");
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

    const saved = await saveRow("sauna_logs", {
      duration_minutes: Number(saunaDuration),
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

    const saved = await saveRow("cold_plunge_logs", {
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
  const saunaMinutes = data.saunas.reduce((total, log) => total + Number(log.duration_minutes), 0);
  const plungeMinutes = data.plunges.reduce((total, log) => total + Number(log.duration_minutes), 0);
  const avgEnergy = average(data.checkins.map((log) => log.energy));
  const avgSleep = average(data.checkins.map((log) => log.sleep));
  const avgSoreness = average(data.checkins.map((log) => log.soreness));

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
