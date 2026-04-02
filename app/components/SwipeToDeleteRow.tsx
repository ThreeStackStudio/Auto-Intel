import { type ReactNode, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme, type AppColors } from "../theme";

const ACTION_WIDTH = 96;
const SWIPE_THRESHOLD = 44;

type SwipeToDeleteRowProps = {
  children: ReactNode;
  onDelete: () => void;
  disabled?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function SwipeToDeleteRow({ children, onDelete, disabled = false }: SwipeToDeleteRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateX = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);
  const isOpen = useRef(false);

  function animateTo(target: number) {
    Animated.spring(translateX, {
      toValue: target,
      useNativeDriver: true,
      speed: 24,
      bounciness: 0
    }).start(() => {
      isOpen.current = target === -ACTION_WIDTH;
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        if (disabled) return false;
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation((value) => {
          startX.current = value;
        });
      },
      onPanResponderMove: (_evt, gestureState) => {
        const next = clamp(startX.current + gestureState.dx, -ACTION_WIDTH, 0);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (disabled) {
          animateTo(0);
          return;
        }

        const movingLeft = gestureState.dx < -SWIPE_THRESHOLD;
        const keepOpen = isOpen.current && gestureState.dx < SWIPE_THRESHOLD;
        animateTo(movingLeft || keepOpen ? -ACTION_WIDTH : 0);
      },
      onPanResponderTerminate: () => {
        animateTo(isOpen.current ? -ACTION_WIDTH : 0);
      }
    })
  ).current;

  function handleDeletePress() {
    animateTo(0);
    onDelete();
  }

  return (
    <View style={styles.container}>
      <View style={styles.actionRail}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete analysis"
          onPress={handleDeletePress}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>

      <Animated.View style={[styles.foreground, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      borderRadius: 14,
      overflow: "hidden"
    },
    actionRail: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "flex-end",
      justifyContent: "center"
    },
    deleteButton: {
      width: ACTION_WIDTH,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.danger
    },
    deletePressed: {
      opacity: 0.85
    },
    deleteText: {
      color: colors.onDanger,
      fontWeight: "800",
      fontSize: 14
    },
    foreground: {
      backgroundColor: "transparent"
    }
  });
}
