import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useAppTheme, type AppColors } from "../theme";

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
        <ActivityIndicator color={secondary ? colors.onSecondarySurface : colors.onPrimary} />
      ) : (
        <Text style={[styles.buttonText, secondary ? styles.secondaryText : styles.primaryText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    button: {
      borderRadius: 12,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20
    },
    primaryButton: {
      backgroundColor: colors.primary
    },
    secondaryButton: {
      backgroundColor: colors.secondarySurface,
      borderWidth: 1,
      borderColor: colors.border
    },
    buttonText: {
      fontSize: 16,
      fontWeight: "700"
    },
    primaryText: {
      color: colors.onPrimary
    },
    secondaryText: {
      color: colors.onSecondarySurface
    },
    disabledButton: {
      opacity: 0.6
    },
    pressed: {
      transform: [{ scale: 0.99 }]
    }
  });
}
