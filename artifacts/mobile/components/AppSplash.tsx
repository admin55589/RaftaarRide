import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

const YELLOW = "#F5A623";
const YELLOW_DARK = "#D4890A";

export function AppSplash() {
  const { width, height } = useWindowDimensions();
  const LOGO_SIZE = Math.min(width, height) * 0.52;

  const logoScale = useRef(new Animated.Value(0.72)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring1Opacity = useRef(new Animated.Value(0.55)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.parallel([
        Animated.timing(ring1, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ring1Opacity, {
          toValue: 0,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    const dotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(560),
        ])
      );

    dotAnim(dot1, 0).start();
    dotAnim(dot2, 190).start();
    dotAnim(dot3, 380).start();
  }, []);

  const ringScale = ring1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.72],
  });

  const ringSize = LOGO_SIZE + 36;

  return (
    <View style={[styles.container, { backgroundColor: YELLOW }]}>
      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            transform: [{ scale: ringScale }],
            opacity: ring1Opacity,
          },
        ]}
      />

      {/* Logo */}
      <Animated.View
        style={{
          transform: [{ scale: logoScale }],
          opacity: logoOpacity,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          elevation: 16,
        }}
      >
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../assets/images/app-logo.jpg")}
          style={{ width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 24 }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Loading dots */}
      <View style={styles.dotsRow}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -6],
                    }),
                  },
                ],
                marginHorizontal: 5,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 3,
    borderColor: YELLOW_DARK,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    bottom: Platform.OS === "web" ? 80 : "12%",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: YELLOW_DARK,
  },
});
