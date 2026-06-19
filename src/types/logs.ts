export type TabKey = "home" | "workout" | "recovery" | "checkin" | "macros" | "stats" | "coaching";

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

export type MacroLog = {
  id: string;
  user_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_oz: number;
  sodium_mg: number;
  body_weight_lb: number;
  notes: string | null;
  logged_date: string;
  created_at: string;
};

export type UserProfile = {
  id: string;
  email: string;
  display_name: string | null;
  role: "coach" | "client" | "both";
  created_at: string;
};

export type CoachClientLink = {
  id: string;
  coach_id: string;
  client_id: string | null;
  status: "pending" | "accepted" | "rejected" | "revoked";
  invited_email: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
