import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";

import { useAppTheme } from "../theme";
import { formatCurrency, formatShortDate } from "../utils/format";

type DataPoint = {
  id: string;
  value: number;
  date: string;
};

type Props = {
  data: DataPoint[];
  currentCarId: string;
};

const CANVAS_HEIGHT = 120;
const H_PADDING = 20;
const V_PADDING = 10;

export function ValuationHistoryChart({ data, currentCarId }: Props) {
  const { colors } = useAppTheme();
  const [canvasWidth, setCanvasWidth] = useState(0);

  function handleLayout(e: LayoutChangeEvent) {
    setCanvasWidth(e.nativeEvent.layout.width);
  }

  const computed = useMemo(() => {
    if (data.length < 2 || canvasWidth === 0) return null;

    const values = data.map((d) => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;

    const plotWidth = canvasWidth - H_PADDING * 2;
    const plotHeight = CANVAS_HEIGHT - V_PADDING * 2;

    const points = data.map((d, i) => ({
      x: H_PADDING + (i / (data.length - 1)) * plotWidth,
      y: V_PADDING + plotHeight - ((d.value - minValue) / valueRange) * plotHeight,
    }));

    const segments = points.slice(0, -1).map((p1, i) => {
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return {
        left: (p1.x + p2.x) / 2 - length / 2,
        top: (p1.y + p2.y) / 2 - 1,
        width: length,
        angle,
      };
    });

    return { points, segments, minValue, maxValue };
  }, [data, canvasWidth]);

  if (data.length < 2) return null;

  return (
    <View onLayout={handleLayout} style={{ minHeight: CANVAS_HEIGHT }}>
      {computed !== null && (
        <>
          <View style={{ height: CANVAS_HEIGHT, position: "relative" }}>
            {computed.segments.map((seg, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: seg.left,
                  top: seg.top,
                  width: seg.width,
                  height: 2,
                  backgroundColor: colors.conditionFill,
                  transform: [{ rotate: `${seg.angle}deg` }],
                }}
              />
            ))}
            {computed.points.map((pt, i) => {
              const isCurrent = data[i].id === currentCarId;
              const dotSize = isCurrent ? 12 : 8;
              return (
                <View
                  key={data[i].id}
                  style={{
                    position: "absolute",
                    left: pt.x - dotSize / 2,
                    top: pt.y - dotSize / 2,
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: isCurrent ? colors.conditionFill : colors.textMuted,
                  }}
                />
              );
            })}
          </View>

          <View style={{ position: "relative", height: 18 }}>
            {data.map((d, i) => {
              const spacing = computed.points.length > 1
                ? (computed.points[computed.points.length - 1].x - computed.points[0].x) / (computed.points.length - 1)
                : 0;
              const showLabel = i === 0 || i === data.length - 1 || spacing >= 44;
              if (!showLabel) return null;
              return (
                <Text
                  key={d.id}
                  style={{
                    position: "absolute",
                    left: computed.points[i].x - 20,
                    width: 40,
                    textAlign: "center",
                    fontSize: 10,
                    color: colors.textSubtle,
                    fontWeight: "600",
                  }}
                >
                  {formatShortDate(d.date)}
                </Text>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: colors.textSubtle }}>
              {formatCurrency(computed.minValue)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textSubtle }}>
              {formatCurrency(computed.maxValue)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
