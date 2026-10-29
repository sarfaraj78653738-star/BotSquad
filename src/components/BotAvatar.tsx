import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { AvatarVariant } from '../lib/avatars';

// A living cute avatar, drawn with plain Views (no image assets).
// It blinks every few seconds, bobs gently while idle, and bounces
// faster while the bot is replying (speaking). One variant per bot,
// picked by the user; Main Chat has its own picked variant.
export function BotAvatar({ variant, size = 44, speaking = false }: { variant: AvatarVariant; size?: number; speaking?: boolean }) {
  const blink = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const doBlink = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.1, duration: 80, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 130, useNativeDriver: true }),
      ]).start();
      timer = setTimeout(doBlink, 2800 + Math.random() * 2400);
    };
    timer = setTimeout(doBlink, 1200 + Math.random() * 2000);
    return () => { alive = false; clearTimeout(timer); };
  }, [blink]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -2, duration: speaking ? 450 : 1200, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: speaking ? 450 : 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, speaking]);

  const s = size;
  const eye = Math.max(3, Math.round(s * 0.11));
  const styles = StyleSheet.create({
    face: { alignItems: 'center', backgroundColor: variant.bg, borderRadius: s / 2, height: s, justifyContent: 'center', overflow: 'visible', width: s },
    eyeRow: { flexDirection: 'row', gap: s * 0.22 },
    eye: { backgroundColor: '#2B2620', borderRadius: eye / 2, height: eye, width: eye },
    mouth: { backgroundColor: '#2B2620', borderRadius: 4, height: speaking ? Math.max(4, s * 0.13) : Math.max(3, s * 0.055), marginTop: s * 0.08, width: s * 0.22 },
    blushRow: { flexDirection: 'row', gap: s * 0.42, marginTop: -s * 0.06, position: 'absolute', top: s * 0.58 },
    blush: { backgroundColor: '#E8907C', borderRadius: s * 0.06, height: s * 0.12, opacity: 0.55, width: s * 0.12 },
    earRound: { backgroundColor: variant.bg, borderRadius: s * 0.11, height: s * 0.22, position: 'absolute', top: -s * 0.04, width: s * 0.22 },
    earCat: { backgroundColor: variant.bg, height: s * 0.2, position: 'absolute', top: -s * 0.03, width: s * 0.2 },
    antennaStem: { backgroundColor: '#2B2620', height: s * 0.14, position: 'absolute', top: -s * 0.13, width: 2 },
    antennaDot: { backgroundColor: '#E8907C', borderRadius: s * 0.05, height: s * 0.1, position: 'absolute', top: -s * 0.2, width: s * 0.1 },
  });

  return (
    <Animated.View style={{ transform: [{ translateY: bob }] }}>
      <View style={styles.face}>
        {variant.ears === 'round' && (<>
          <View style={[styles.earRound, { left: s * 0.08 }]} />
          <View style={[styles.earRound, { right: s * 0.08 }]} />
        </>)}
        {variant.ears === 'cat' && (<>
          <View style={[styles.earCat, { left: s * 0.1, transform: [{ rotate: '-18deg' }] }]} />
          <View style={[styles.earCat, { right: s * 0.1, transform: [{ rotate: '18deg' }] }]} />
        </>)}
        {variant.ears === 'antenna' && (<>
          <View style={[styles.antennaStem, { left: s / 2 - 1 }]} />
          <View style={[styles.antennaDot, { left: s / 2 - s * 0.05 }]} />
        </>)}
        <Animated.View style={[styles.eyeRow, { transform: [{ scaleY: blink }] }]}>
          <View style={styles.eye} />
          <View style={styles.eye} />
        </Animated.View>
        <View style={styles.mouth} />
        {variant.blush && (
          <View style={styles.blushRow}>
            <View style={styles.blush} />
            <View style={styles.blush} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}
