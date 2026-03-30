import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type LoadingOverlayProps = {
  message?: string;
};

export function LoadingOverlay({ message = "Loading..." }: LoadingOverlayProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0A1728" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#F5F8FC"
  },
  message: {
    fontSize: 16,
    color: "#0A1728",
    fontWeight: "500"
  }
});

