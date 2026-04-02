import { useColorScheme } from "react-native";

export type AppColorScheme = "light" | "dark";

export type AppColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  onPrimary: string;
  secondarySurface: string;
  onSecondarySurface: string;
  success: string;
  danger: string;
  onDanger: string;
  link: string;
  inputBackground: string;
  inputBorder: string;
  placeholder: string;
  stepPendingBackground: string;
  stepPendingBorder: string;
  stepDoneBackground: string;
  stepDoneBorder: string;
  stepActiveBorder: string;
  conditionTrack: string;
  conditionFill: string;
  skeletonCard: string;
  skeletonBarStrong: string;
  skeletonBar: string;
  skeletonBarLight: string;
};

const lightColors: AppColors = {
  background: "#EEF4FA",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F8FC",
  border: "#D8E2EF",
  borderStrong: "#C8D5E5",
  text: "#0A1728",
  textMuted: "#35516D",
  textSubtle: "#5A718B",
  primary: "#0A1728",
  onPrimary: "#FFFFFF",
  secondarySurface: "#D8E8FF",
  onSecondarySurface: "#0A1728",
  success: "#0B5D1E",
  danger: "#B3261E",
  onDanger: "#FFFFFF",
  link: "#0E4F8A",
  inputBackground: "#FFFFFF",
  inputBorder: "#CAD5E3",
  placeholder: "#7A8798",
  stepPendingBackground: "#FFFFFF",
  stepPendingBorder: "#C8D5E5",
  stepDoneBackground: "#EAF8EE",
  stepDoneBorder: "#91C8A5",
  stepActiveBorder: "#0E4F8A",
  conditionTrack: "#D6E1ED",
  conditionFill: "#0E4F8A",
  skeletonCard: "#FFFFFF",
  skeletonBarStrong: "#C5D5E8",
  skeletonBar: "#B8CCDE",
  skeletonBarLight: "#D4E3EF"
};

const darkColors: AppColors = {
  background: "#0B1220",
  surface: "#121B2B",
  surfaceMuted: "#161F31",
  border: "#23344A",
  borderStrong: "#2D435F",
  text: "#E6EEF9",
  textMuted: "#ADC3DC",
  textSubtle: "#8EA6C3",
  primary: "#66A8FF",
  onPrimary: "#081120",
  secondarySurface: "#223247",
  onSecondarySurface: "#E6EEF9",
  success: "#59D38C",
  danger: "#E76C68",
  onDanger: "#1E0808",
  link: "#7CBBFF",
  inputBackground: "#0F1827",
  inputBorder: "#2E425D",
  placeholder: "#6F839C",
  stepPendingBackground: "#101A29",
  stepPendingBorder: "#2A3D57",
  stepDoneBackground: "#103024",
  stepDoneBorder: "#2F8F69",
  stepActiveBorder: "#66B2FF",
  conditionTrack: "#273B57",
  conditionFill: "#66B2FF",
  skeletonCard: "#101A29",
  skeletonBarStrong: "#2F4460",
  skeletonBar: "#3A5475",
  skeletonBarLight: "#2A3E59"
};

export function getAppColors(scheme: AppColorScheme) {
  return scheme === "dark" ? darkColors : lightColors;
}

export function useAppTheme() {
  const current = useColorScheme();
  const scheme: AppColorScheme = current === "dark" ? "dark" : "light";
  const colors = getAppColors(scheme);

  return {
    scheme,
    isDark: scheme === "dark",
    colors
  };
}
