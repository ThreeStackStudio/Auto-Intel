import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme, type AppColors } from "../theme";

type LoadingOverlayProps = {
  message?: string;
  onCancel?: () => void;
};

export function LoadingOverlay({ message = "Loading...", onCancel }: LoadingOverlayProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{message}</Text>
      {onCancel ? (
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelPressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      backgroundColor: colors.surfaceMuted
    },
    message: {
      fontSize: 16,
      color: colors.text,
      fontWeight: "500"
    },
    cancelBtn: {
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 28,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface
    },
    cancelPressed: {
      opacity: 0.6
    },
    cancelText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textMuted
    }
  });
}

