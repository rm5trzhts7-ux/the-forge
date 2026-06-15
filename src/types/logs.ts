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

export type SaunaLog = {
  id: string;
  user_id: string;
  duration_minutes: number;
  notes: string | null;
  created_at: string;
};

export type ColdPlungeLog = {
  id: string;
  user_id: string;
  duration_minutes: number;
  temperature: number;
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
