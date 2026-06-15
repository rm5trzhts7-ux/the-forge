import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { colors, Field, PrimaryButton } from "../components/ui";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 6) {
      Alert.alert("Check your details", "Use an email and a password with at least 6 characters.");
      return;
    }

    setLoading(true);
    const action =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email: email.trim(), password })
        : supabase.auth.signUp({ email: email.trim(), password });

    const { error } = await action;
    setLoading(false);

    if (error) {
      Alert.alert("Auth error", error.message);
      return;
    }

    if (mode === "signup") {
      Alert.alert("Account created", "If email confirmation is enabled, confirm your email before logging in.");
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>THE FORGE</Text>
        <Text style={styles.title}>Train hard. Recover colder. Track everything.</Text>
        <Text style={styles.copy}>
          A stripped-down command center for lifting, sauna, cold plunge, and daily readiness.
        </Text>
      </View>

      <View style={styles.authCard}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>{mode === "login" ? "Welcome back" : "Start forging"}</Text>
          <Text style={styles.formSubtitle}>
            {mode === "login" ? "Log in to continue tracking your work." : "Create your account and start logging."}
          </Text>
        </View>

        <View style={styles.switcher}>
          <Pressable
            onPress={() => setMode("login")}
            style={[styles.switchButton, mode === "login" && styles.switchButtonActive]}
          >
            <Text style={[styles.switchText, mode === "login" && styles.switchTextActive]}>Login</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("signup")}
            style={[styles.switchButton, mode === "signup" && styles.switchButtonActive]}
          >
            <Text style={[styles.switchText, mode === "signup" && styles.switchTextActive]}>Sign up</Text>
          </Pressable>
        </View>

        <Field
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          containerStyle={styles.authField}
          inputStyle={styles.authInput}
          keyboardType="email-address"
          label="Email address"
          onChangeText={setEmail}
          placeholder="you@example.com"
          textContentType="emailAddress"
          value={email}
        />
        <Field
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.authField}
          inputStyle={styles.authInput}
          label="Password"
          onChangeText={setPassword}
          placeholder="Minimum 6 characters"
          secureTextEntry
          textContentType={mode === "login" ? "password" : "newPassword"}
          value={password}
        />
        <PrimaryButton
          loading={loading}
          onPress={submit}
          title={mode === "login" ? "Enter The Forge" : "Create Account"}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  hero: {
    marginBottom: 24,
    gap: 10
  },
  kicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 39
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23
  },
  authCard: {
    backgroundColor: "#121214",
    borderColor: "#333337",
    borderRadius: 8,
    borderWidth: 1,
    gap: 18,
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 24
  },
  formHeader: {
    gap: 5
  },
  formTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  formSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  switcher: {
    backgroundColor: colors.panelSoft,
    borderRadius: 8,
    flexDirection: "row",
    padding: 4
  },
  switchButton: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    paddingVertical: 10
  },
  switchButtonActive: {
    backgroundColor: colors.accent
  },
  switchText: {
    color: colors.muted,
    fontWeight: "800"
  },
  switchTextActive: {
    color: "#111111"
  },
  authField: {
    gap: 8
  },
  authInput: {
    backgroundColor: "#202024",
    borderColor: "#4a4a50",
    borderWidth: 1.5,
    fontSize: 17,
    minHeight: 56,
    paddingHorizontal: 14
  }
});
