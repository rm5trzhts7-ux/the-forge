import { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "react-native";
import { LoadingScreen } from "./src/components/LoadingScreen";
import { supabase } from "./src/lib/supabase";
import { AuthScreen } from "./src/screens/AuthScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";

void SplashScreen.preventAutoHideAsync();

SplashScreen.setOptions({
  duration: 450,
  fade: true
});

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setDashboardReady(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const appReady = authChecked && (!session || dashboardReady);
  const handleDashboardReady = useCallback(() => {
    setDashboardReady(true);
  }, []);

  useEffect(() => {
    if (appReady) {
      void SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!authChecked) {
    return (
      <>
        <LoadingScreen />
        <StatusBar barStyle="light-content" />
      </>
    );
  }

  return (
    <>
      {session ? <DashboardScreen onInitialLoadComplete={handleDashboardReady} session={session} /> : <AuthScreen />}
      <StatusBar barStyle="light-content" />
    </>
  );
}
