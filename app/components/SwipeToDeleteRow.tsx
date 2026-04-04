import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme, type AppColors } from "../theme";

const ACTION_WIDTH = 96;
const SWIPE_OPEN_THRESHOLD = 42;
const SWIPE_ACTIVATION_DISTANCE = 18;

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
  const deleteRevealOpacity = translateX.interpolate({
    inputRange: [-ACTION_WIDTH, -20, 0],
    outputRange: [1, 0.25, 0],
    extrapolate: "clamp"
  });

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

  useEffect(() => {
    if (disabled) {
      animateTo(0);
    }
  }, [disabled]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        if (disabled) return false;
        const mostlyHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.35;
        const lowVerticalNoise = Math.abs(gestureState.dy) < 18;
        const leftSwipeToOpen = gestureState.dx < -SWIPE_ACTIVATION_DISTANCE;
        const rightSwipeToClose = isOpen.current && gestureState.dx > 8;
        return (leftSwipeToOpen || rightSwipeToClose) && mostlyHorizontal && lowVerticalNoise;
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

        const finalX = clamp(startX.current + gestureState.dx, -ACTION_WIDTH, 0);
        const shouldOpen = finalX <= -SWIPE_OPEN_THRESHOLD || gestureState.vx < -0.35;
        animateTo(shouldOpen ? -ACTION_WIDTH : 0);
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
        <Animated.View style={[styles.deleteButtonWrap, { opacity: deleteRevealOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete analysis"
            onPress={handleDeletePress}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </Animated.View>
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
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.danger
    },
    deleteButtonWrap: {
      width: ACTION_WIDTH,
      flex: 1
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
