export type TabKey = "home" | "workout" | "recovery" | "checkin" | "stats";

export type WorkoutLog = {
  id: string;
  user_id: string;
  exercise: string;
  sets: number;
  reps: number;
  weight: number;
  notes: string | null;
  created_at: string;
};

export type RestPeriod = {
  id: string;
  user_id: string;
  workout_id: string;
  duration_seconds: number;
  interval_order: number;
  created_at: string;
};

export type RecoveryLog = {
  id: string;
  user_id: string;
  recovery_type: "sauna" | "cold_plunge";
  duration_minutes: number;
  temperature_f: number | null;
  notes: string | null;
  created_at: string;
};

export type DailyCheckIn = {
  id: string;
  user_id: string;
  mood: number;
  energy: number;
  soreness: number;
  sleep: number;
  motivation: number;
  notes: string | null;
  created_at: string;
};
