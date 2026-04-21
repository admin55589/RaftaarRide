import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");
const YELLOW = "#F5A623";
const YELLOW_DARK = "#E8940A";

export function AppSplash() {
  const logoScale = useRef(new Animated.Value(0.72)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring1Opacity = useRef(new Animated.Value(0.6)).current;

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
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      );

    dotAnim(dot1, 0).start();
    dotAnim(dot2, 200).start();
    dotAnim(dot3, 400).start();
  }, []);

  const ringScale = ring1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.7],
  });

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={YELLOW} barStyle="dark-content" translucent={false} />

      <View style={styles.logoWrapper}>
        <Animated.View
          style={[
            styles.ring,
            {
              transform: [{ scale: ringScale }],
              opacity: ring1Opacity,
            },
          ]}
        />

        <Animated.View
          style={{
            transform: [{ scale: logoScale }],
            opacity: logoOpacity,
          }}
        >
          <Image
            source={require("../assets/images/app-logo.jpg")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      <View style={styles.dotsRow}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -5],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const LOGO_SIZE = width * 0.58;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: YELLOW,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrapper: {
    width: LOGO_SIZE + 40,
    height: LOGO_SIZE + 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 48,
  },
  ring: {
    position: "absolute",
    width: LOGO_SIZE + 32,
    height: LOGO_SIZE + 32,
    borderRadius: (LOGO_SIZE + 32) / 2,
    borderWidth: 3,
    borderColor: YELLOW_DARK,
    opacity: 0.5,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 18,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 10,
    position: "absolute",
    bottom: height * 0.12,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: YELLOW_DARK,
  },
});
