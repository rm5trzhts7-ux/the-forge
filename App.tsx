import { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { StatusBar } from "react-native";
import { LoadingScreen } from "./src/components/LoadingScreen";
import { supabase } from "./src/lib/supabase";
import { AuthScreen } from "./src/screens/AuthScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <>
        <LoadingScreen />
        <StatusBar barStyle="light-content" />
      </>
    );
  }

  return (
    <>
      {session ? <DashboardScreen session={session} /> : <AuthScreen />}
      <StatusBar barStyle="light-content" />
    </>
  );
}
