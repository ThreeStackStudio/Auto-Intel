import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type LoadingOverlayProps = {
  message?: string;
  onCancel?: () => void;
};

export function LoadingOverlay({ message = "Loading...", onCancel }: LoadingOverlayProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0A1728" />
      <Text style={styles.message}>{message}</Text>
      {onCancel ? (
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelPressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      ) : null}
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
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#B0BEC5"
  },
  cancelPressed: {
    opacity: 0.6
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#38536F"
  }
});

