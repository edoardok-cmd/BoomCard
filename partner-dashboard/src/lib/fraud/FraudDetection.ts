/**
 * Fraud Detection System
 * Analyzes transactions and user behavior to detect suspicious activity
 */

export type FraudRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface FraudCheck {
  passed: boolean;
  riskLevel: FraudRiskLevel;
  score: number; // 0-100
  flags: string[];
  recommendations: string[];
  timestamp: Date;
}

export interface TransactionData {
  id: string;
  amount: number;
  currency: string;
  userId: string;
  venueId: string;
  cardNumber?: string;
  ipAddress?: string;
  deviceId?: string;
  location?: {
    lat: number;
    lng: number;
  };
  timestamp: Date;
}

export interface UserBehaviorData {
  userId: string;
  transactionHistory: TransactionData[];
  registrationDate: Date;
  lastLoginDate: Date;
  deviceCount: number;
  locationCount: number;
}

export class FraudDetection {
  private blacklistedIPs: Set<string> = new Set();
  private blacklistedCards: Set<string> = new Set();
  private blacklistedUsers: Set<string> = new Set();
  private riskThresholds = {
    low: 20,
    medium: 40,
    high: 70,
    critical: 90,
  };

  /**
   * Analyze transaction for fraud
   */
  async analyzeTransaction(
    transaction: TransactionData,
    userBehavior?: UserBehaviorData
  ): Promise<FraudCheck> {
    const flags: string[] = [];
    let score = 0;

    // Check amount anomalies
    const amountCheck = this.checkAmountAnomaly(transaction, userBehavior);
    if (!amountCheck.passed) {
      flags.push(amountCheck.reason);
      score += amountCheck.score;
    }

    // Check velocity (frequency)
    if (userBehavior) {
      const velocityCheck = this.checkVelocity(transaction, userBehavior);
      if (!velocityCheck.passed) {
        flags.push(velocityCheck.reason);
        score += velocityCheck.score;
      }
    }

    // Check location
    if (transaction.location && userBehavior) {
      const locationCheck = this.checkLocation(transaction, userBehavior);
      if (!locationCheck.passed) {
        flags.push(locationCheck.reason);
        score += locationCheck.score;
      }
    }

    // Check blacklists
    const blacklistCheck = this.checkBlacklists(transaction);
    if (!blacklistCheck.passed) {
      flags.push(blacklistCheck.reason);
      score += blacklistCheck.score;
    }

    // Check device fingerprint
    if (transaction.deviceId && userBehavior) {
      const deviceCheck = this.checkDevice(transaction, userBehavior);
      if (!deviceCheck.passed) {
        flags.push(deviceCheck.reason);
        score += deviceCheck.score;
      }
    }

    // Check time patterns
    const timeCheck = this.checkTimePattern(transaction, userBehavior);
    if (!timeCheck.passed) {
      flags.push(timeCheck.reason);
      score += timeCheck.score;
    }

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(score);

    // Generate recommendations
    const recommendations = this.generateRecommendations(flags, riskLevel);

    return {
      passed: riskLevel === 'low',
      riskLevel,
      score,
      flags,
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Check for amount anomalies
   */
  private checkAmountAnomaly(
    transaction: TransactionData,
    userBehavior?: UserBehaviorData
  ): { passed: boolean; reason: string; score: number } {
    // Check if amount is unusually high
    if (transaction.amount > 100000) { // $1,000
      return {
        passed: false,
        reason: 'Transaction amount exceeds normal threshold',
        score: 20,
      };
    }

    // Check against user's average transaction
    if (userBehavior && userBehavior.transactionHistory.length > 0) {
      const avgAmount = userBehavior.transactionHistory.reduce(
        (sum, t) => sum + t.amount,
        0
      ) / userBehavior.transactionHistory.length;

      if (transaction.amount > avgAmount * 5) {
        return {
          passed: false,
          reason: 'Transaction amount significantly exceeds user average',
          score: 15,
        };
      }
    }

    return { passed: true, reason: '', score: 0 };
  }

  /**
   * Check transaction velocity (frequency)
   */
  private checkVelocity(
    transaction: TransactionData,
    userBehavior: UserBehaviorData
  ): { passed: boolean; reason: string; score: number } {
    const recentTransactions = userBehavior.transactionHistory.filter(t => {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return new Date(t.timestamp) > hourAgo;
    });

    // More than 5 transactions in an hour
    if (recentTransactions.length >= 5) {
      return {
        passed: false,
        reason: 'High transaction velocity detected',
        score: 25,
      };
    }

    // Check same venue
    const sameVenue = recentTransactions.filter(t => t.venueId === transaction.venueId);
    if (sameVenue.length >= 3) {
      return {
        passed: false,
        reason: 'Multiple transactions at same venue in short time',
        score: 20,
      };
    }

    return { passed: true, reason: '', score: 0 };
  }

  /**
   * Check location anomalies
   */
  private checkLocation(
    transaction: TransactionData,
    userBehavior: UserBehaviorData
  ): { passed: boolean; reason: string; score: number } {
    if (!transaction.location) {
      return { passed: true, reason: '', score: 0 };
    }

    // Get recent transactions with location
    const recentWithLocation = userBehavior.transactionHistory
      .filter(t => t.location && new Date(t.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (recentWithLocation.length > 0) {
      const lastLocation = recentWithLocation[0].location!;
      const distance = this.calculateDistance(
        transaction.location.lat,
        transaction.location.lng,
        lastLocation.lat,
        lastLocation.lng
      );

      // Impossible travel: >500km in <1 hour
      const timeDiff = transaction.timestamp.getTime() - new Date(recentWithLocation[0].timestamp).getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (distance > 500 && hoursDiff < 1) {
        return {
          passed: false,
          reason: 'Impossible travel detected',
          score: 30,
        };
      }

      // Unusual location (>1000km from usual)
      if (distance > 1000) {
        return {
          passed: false,
          reason: 'Transaction from unusual location',
          score: 15,
        };
      }
    }

    return { passed: true, reason: '', score: 0 };
  }

  /**
   * Check blacklists
   */
  private checkBlacklists(
    transaction: TransactionData
  ): { passed: boolean; reason: string; score: number } {
    if (this.blacklistedUsers.has(transaction.userId)) {
      return {
        passed: false,
        reason: 'User is blacklisted',
        score: 100,
      };
    }

    if (transaction.cardNumber && this.blacklistedCards.has(transaction.cardNumber)) {
      return {
        passed: false,
        reason: 'Card is blacklisted',
        score: 100,
      };
    }

    if (transaction.ipAddress && this.blacklistedIPs.has(transaction.ipAddress)) {
      return {
        passed: false,
        reason: 'IP address is blacklisted',
        score: 50,
      };
    }

    return { passed: true, reason: '', score: 0 };
  }

  /**
   * Check device fingerprint
   */
  private checkDevice(
    transaction: TransactionData,
    userBehavior: UserBehaviorData
  ): { passed: boolean; reason: string; score: number } {
    if (!transaction.deviceId) {
      return { passed: true, reason: '', score: 0 };
    }

    // Check if device is new
    const knownDevices = new Set(
      userBehavior.transactionHistory
        .filter(t => t.deviceId)
        .map(t => t.deviceId!)
    );

    if (!knownDevices.has(transaction.deviceId)) {
      // New device on old account
      const accountAge = Date.now() - userBehavior.registrationDate.getTime();
      const daysSinceRegistration = accountAge / (1000 * 60 * 60 * 24);

      if (daysSinceRegistration > 30) {
        return {
          passed: false,
          reason: 'Transaction from new device on established account',
          score: 10,
        };
      }
    }

    return { passed: true, reason: '', score: 0 };
  }

  /**
   * Check time patterns
   */
  private checkTimePattern(
    transaction: TransactionData,
    userBehavior?: UserBehaviorData
  ): { passed: boolean; reason: string; score: number } {
    const hour = transaction.timestamp.getHours();

    // Unusual hours (2 AM - 5 AM)
    if (hour >= 2 && hour < 5) {
      return {
        passed: false,
        reason: 'Transaction during unusual hours',
        score: 10,
      };
    }

    return { passed: true, reason: '', score: 0 };
  }

  /**
   * Calculate risk level from score
   */
  private calculateRiskLevel(score: number): FraudRiskLevel {
    if (score >= this.riskThresholds.critical) return 'critical';
    if (score >= this.riskThresholds.high) return 'high';
    if (score >= this.riskThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on flags
   */
  private generateRecommendations(flags: string[], riskLevel: FraudRiskLevel): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical') {
      recommendations.push('Block transaction immediately');
      recommendations.push('Suspend user account');
      recommendations.push('Alert security team');
    } else if (riskLevel === 'high') {
      recommendations.push('Require additional verification');
      recommendations.push('Contact user for confirmation');
      recommendations.push('Monitor account activity');
    } else if (riskLevel === 'medium') {
      recommendations.push('Review transaction manually');
      recommendations.push('Send notification to user');
      recommendations.push('Enable additional monitoring');
    } else {
      recommendations.push('Proceed with transaction');
      recommendations.push('Continue normal monitoring');
    }

    return recommendations;
  }

  /**
   * Calculate distance between two points (Haversine)
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Add to blacklist
   */
  blacklistUser(userId: string): void {
    this.blacklistedUsers.add(userId);
  }

  blacklistCard(cardNumber: string): void {
    this.blacklistedCards.add(cardNumber);
  }

  blacklistIP(ipAddress: string): void {
    this.blacklistedIPs.add(ipAddress);
  }

  /**
   * Remove from blacklist
   */
  unblacklistUser(userId: string): void {
    this.blacklistedUsers.delete(userId);
  }

  unblacklistCard(cardNumber: string): void {
    this.blacklistedCards.delete(cardNumber);
  }

  unblacklistIP(ipAddress: string): void {
    this.blacklistedIPs.delete(ipAddress);
  }

  /**
   * Get fraud statistics
   */
  async getFraudStatistics(startDate: Date, endDate: Date): Promise<{
    totalChecks: number;
    flaggedTransactions: number;
    blockedTransactions: number;
    falsePositives: number;
    riskDistribution: Record<FraudRiskLevel, number>;
  }> {
    // This would query your database
    return {
      totalChecks: 1234,
      flaggedTransactions: 45,
      blockedTransactions: 12,
      falsePositives: 3,
      riskDistribution: {
        low: 1150,
        medium: 50,
        high: 22,
        critical: 12,
      },
    };
  }

  /**
   * Train fraud detection model (placeholder)
   */
  async trainModel(trainingData: Array<{ transaction: TransactionData; isFraud: boolean }>): Promise<void> {
    // This would integrate with ML model training
    console.log(`Training fraud detection model with ${trainingData.length} samples`);
  }
}

// Singleton instance
let globalFraudDetection: FraudDetection | null = null;

export function getFraudDetection(): FraudDetection {
  if (!globalFraudDetection) {
    globalFraudDetection = new FraudDetection();
  }
  return globalFraudDetection;
}

export default FraudDetection;
