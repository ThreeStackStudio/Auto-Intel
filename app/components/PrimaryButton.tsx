import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
};

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary"
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const secondary = variant === "secondary";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : styles.primaryButton,
        isDisabled && styles.disabledButton,
        pressed && !isDisabled && styles.pressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? "#0A1728" : "#FFFFFF"} />
      ) : (
        <Text style={[styles.buttonText, secondary ? styles.secondaryText : styles.primaryText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  primaryButton: {
    backgroundColor: "#0A1728"
  },
  secondaryButton: {
    backgroundColor: "#D8E8FF"
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700"
  },
  primaryText: {
    color: "#FFFFFF"
  },
  secondaryText: {
    color: "#0A1728"
  },
  disabledButton: {
    opacity: 0.6
  },
  pressed: {
    transform: [{ scale: 0.99 }]
  }
});

