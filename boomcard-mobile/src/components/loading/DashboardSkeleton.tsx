import React from 'react';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ShimmerPlaceholder from './ShimmerPlaceholder';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DashboardSkeletonProps {
  isDarkMode: boolean;
}

const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ isDarkMode }) => {
  const bg = isDarkMode ? '#111827' : '#FFFFFF';
  const surface = isDarkMode ? '#1F2937' : '#F3F4F6';
  const heroGradient: [string, string] = isDarkMode
    ? ['#1E3A8A', '#5B21B6']
    : ['#3B82F6', '#8B5CF6'];

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
        <ShimmerPlaceholder width={100} height={14} borderRadius={4} isDarkMode style={{ marginTop: 16 }} />
        <ShimmerPlaceholder width={180} height={26} borderRadius={6} isDarkMode style={{ marginTop: 6 }} />
        {/* Cashback line */}
        <View style={styles.heroBottom}>
          <View>
            <ShimmerPlaceholder width={80} height={10} borderRadius={3} isDarkMode />
            <ShimmerPlaceholder width={140} height={22} borderRadius={5} isDarkMode style={{ marginTop: 6 }} />
          </View>
          <ShimmerPlaceholder width={80} height={28} borderRadius={12} isDarkMode />
        </View>
      </LinearGradient>

      {/* Plan banner skeleton */}
      <View style={[styles.planBanner, { backgroundColor: surface }]}>
        <View style={styles.planRow}>
          <ShimmerPlaceholder width={28} height={28} borderRadius={6} isDarkMode={isDarkMode} />
          <View style={{ marginLeft: 12, gap: 4 }}>
            <ShimmerPlaceholder width={60} height={10} borderRadius={3} isDarkMode={isDarkMode} />
            <ShimmerPlaceholder width={100} height={18} borderRadius={4} isDarkMode={isDarkMode} />
          </View>
        </View>
        <ShimmerPlaceholder width={60} height={20} borderRadius={10} isDarkMode={isDarkMode} />
      </View>

      {/* Quick actions skeleton */}
      <View style={styles.quickActions}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.actionCard, { backgroundColor: surface }]}>
            <ShimmerPlaceholder width={48} height={48} borderRadius={24} isDarkMode={isDarkMode} />
            <ShimmerPlaceholder width={80} height={14} borderRadius={4} isDarkMode={isDarkMode} style={{ marginTop: 10 }} />
            <ShimmerPlaceholder width={100} height={11} borderRadius={3} isDarkMode={isDarkMode} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Stats row skeleton */}
      <View style={styles.statsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.statCard, { backgroundColor: surface }]}>
            <ShimmerPlaceholder width={40} height={40} borderRadius={20} isDarkMode={isDarkMode} />
            <ShimmerPlaceholder width={50} height={16} borderRadius={4} isDarkMode={isDarkMode} style={{ marginTop: 8 }} />
            <ShimmerPlaceholder width={60} height={10} borderRadius={3} isDarkMode={isDarkMode} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>

      {/* Venue list skeleton */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ShimmerPlaceholder width={130} height={18} borderRadius={4} isDarkMode={isDarkMode} />
          <ShimmerPlaceholder width={50} height={14} borderRadius={3} isDarkMode={isDarkMode} />
        </View>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.venueCard, { backgroundColor: surface }]}>
            <ShimmerPlaceholder width={44} height={44} borderRadius={22} isDarkMode={isDarkMode} />
            <View style={{ flex: 1, marginLeft: 12, gap: 4 }}>
              <ShimmerPlaceholder width={140} height={14} borderRadius={4} isDarkMode={isDarkMode} />
              <ShimmerPlaceholder width={100} height={11} borderRadius={3} isDarkMode={isDarkMode} />
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <ShimmerPlaceholder width={60} height={13} borderRadius={3} isDarkMode={isDarkMode} />
              <ShimmerPlaceholder width={50} height={11} borderRadius={3} isDarkMode={isDarkMode} />
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
    paddingTop: Platform.OS === 'ios' ? 16 : 12,
    paddingBottom: 48,
    paddingHorizontal: 20,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  planBanner: {
    marginHorizontal: 16,
    marginTop: -28,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
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
    gap: 12,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  venueCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
});

export default DashboardSkeleton;
