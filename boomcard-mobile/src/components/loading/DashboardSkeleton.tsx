import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ShimmerPlaceholder from './ShimmerPlaceholder';

interface DashboardSkeletonProps {
  isDarkMode: boolean;
}

const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ isDarkMode }) => {
  const bg = isDarkMode ? '#111827' : '#FFFFFF';
  const surface = isDarkMode ? '#1F2937' : '#FAFBFC';
  const border = isDarkMode ? '#374151' : 'rgba(0,0,0,0.04)';
  const heroGradient: [string, string] = isDarkMode
    ? ['#0F172A', '#1E293B']
    : ['#000000', '#111111'];

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Hero header skeleton */}
      <LinearGradient
        colors={heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Brand row */}
        <View style={styles.heroTop}>
          <ShimmerPlaceholder width={120} height={24} borderRadius={6} isDarkMode />
          <ShimmerPlaceholder width={44} height={44} borderRadius={22} isDarkMode />
        </View>
        {/* Greeting */}
        <ShimmerPlaceholder width={100} height={12} borderRadius={4} isDarkMode style={{ marginTop: 16 }} />
        <ShimmerPlaceholder width={200} height={30} borderRadius={6} isDarkMode style={{ marginTop: 6 }} />
        {/* Cashback card */}
        <View style={[styles.heroCashbackCard, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(212,168,67,0.12)' }]}>
          <View>
            <ShimmerPlaceholder width={80} height={10} borderRadius={3} isDarkMode />
            <ShimmerPlaceholder width={160} height={28} borderRadius={5} isDarkMode style={{ marginTop: 6 }} />
          </View>
          <ShimmerPlaceholder width={90} height={32} borderRadius={16} isDarkMode />
        </View>
      </LinearGradient>

      {/* Plan banner skeleton */}
      <View style={[styles.planBanner, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.planRow}>
          <ShimmerPlaceholder width={32} height={32} borderRadius={6} isDarkMode={isDarkMode} />
          <View style={{ marginLeft: 12, gap: 4 }}>
            <ShimmerPlaceholder width={60} height={10} borderRadius={3} isDarkMode={isDarkMode} />
            <ShimmerPlaceholder width={100} height={20} borderRadius={4} isDarkMode={isDarkMode} />
          </View>
        </View>
        <ShimmerPlaceholder width={60} height={22} borderRadius={12} isDarkMode={isDarkMode} />
      </View>

      {/* Quick actions skeleton — 3 columns */}
      <View style={styles.quickActions}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.actionCard, { backgroundColor: surface, borderColor: border }]}>
            <ShimmerPlaceholder width={44} height={44} borderRadius={22} isDarkMode={isDarkMode} />
            <ShimmerPlaceholder width={64} height={13} borderRadius={4} isDarkMode={isDarkMode} style={{ marginTop: 10 }} />
            <ShimmerPlaceholder width={56} height={11} borderRadius={3} isDarkMode={isDarkMode} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Stats card skeleton — unified */}
      <View style={[styles.statsCard, { backgroundColor: surface, borderColor: border }]}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[styles.statDivider, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />}
            <View style={styles.statItem}>
              <ShimmerPlaceholder width={36} height={36} borderRadius={18} isDarkMode={isDarkMode} />
              <ShimmerPlaceholder width={50} height={20} borderRadius={4} isDarkMode={isDarkMode} style={{ marginTop: 8 }} />
              <ShimmerPlaceholder width={60} height={10} borderRadius={3} isDarkMode={isDarkMode} style={{ marginTop: 4 }} />
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Upgrade banner skeleton */}
      <View style={[styles.upgradeBanner, { backgroundColor: isDarkMode ? '#1E3A8A' : '#0A0A0A' }]}>
        <ShimmerPlaceholder width={28} height={28} borderRadius={14} isDarkMode />
        <View style={{ flex: 1, marginLeft: 14, gap: 4 }}>
          <ShimmerPlaceholder width={130} height={15} borderRadius={4} isDarkMode />
          <ShimmerPlaceholder width={170} height={12} borderRadius={3} isDarkMode />
        </View>
        <ShimmerPlaceholder width={32} height={32} borderRadius={16} isDarkMode />
      </View>

      {/* Venue list skeleton */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ShimmerPlaceholder width={130} height={19} borderRadius={4} isDarkMode={isDarkMode} />
          <ShimmerPlaceholder width={50} height={14} borderRadius={3} isDarkMode={isDarkMode} />
        </View>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.venueCard, { backgroundColor: surface, borderColor: border }]}>
            <ShimmerPlaceholder width={36} height={36} borderRadius={18} isDarkMode={isDarkMode} />
            <View style={{ flex: 1, marginLeft: 12, gap: 4 }}>
              <ShimmerPlaceholder width={140} height={15} borderRadius={4} isDarkMode={isDarkMode} />
              <ShimmerPlaceholder width={100} height={12} borderRadius={3} isDarkMode={isDarkMode} />
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <ShimmerPlaceholder width={60} height={13} borderRadius={3} isDarkMode={isDarkMode} />
              <ShimmerPlaceholder width={50} height={12} borderRadius={3} isDarkMode={isDarkMode} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 56,
    paddingHorizontal: 24,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroCashbackCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 20,
    borderRadius: 16,
    padding: 16,
  },
  planBanner: {
    marginHorizontal: 16,
    marginTop: -32,
    marginBottom: 20,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  statsCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  upgradeBanner: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  venueCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
});

export default DashboardSkeleton;
