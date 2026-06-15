import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "./ui";

export function LoadingScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.mark}>
        <Text style={styles.brand}>THE FORGE</Text>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.copy}>Forging your daily signal...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  mark: {
    alignItems: "center",
    gap: 18
  },
  brand: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 3
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4
  }
});
