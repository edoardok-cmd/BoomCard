import request from 'supertest';
import { app } from '../../src/server';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
} from '../helpers/test-utils';

describe('POST /api/subscriptions/:id/update-plan — upgrade gate (§3.6)', () => {
  const userIds: string[] = [];

  afterAll(async () => {
    for (const id of userIds) {
      await cleanupTestUser(id);
    }
  });

  async function makeUpgradeRequest(
    subId: string,
    token: string,
    newPlan: string,
  ) {
    return request(app)
      .post(`/api/subscriptions/${subId}/update-plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: newPlan });
  }

  it('rejects EXPIRED subscription → 422', async () => {
    const { user, accessToken } = await createTestUser();
    userIds.push(user.id);
    const sub = await createTestSubscription(user.id, 'BASIC', 'EXPIRED');
    const res = await makeUpgradeRequest(sub.id, accessToken, 'PREMIUM_MONTHLY');
    expect(res.status).toBe(422);
  });

  it('rejects CANCELLED subscription → 422', async () => {
    const { user, accessToken } = await createTestUser();
    userIds.push(user.id);
    const sub = await createTestSubscription(user.id, 'BASIC', 'CANCELLED');
    const res = await makeUpgradeRequest(sub.id, accessToken, 'PREMIUM_MONTHLY');
    expect(res.status).toBe(422);
  });

  it('rejects FAILED_PAYMENT subscription → 422', async () => {
    const { user, accessToken } = await createTestUser();
    userIds.push(user.id);
    const sub = await createTestSubscription(user.id, 'BASIC', 'FAILED_PAYMENT');
    const res = await makeUpgradeRequest(sub.id, accessToken, 'PREMIUM_MONTHLY');
    expect(res.status).toBe(422);
  });

  it('rejects ACTIVE subscription already on PREMIUM_MONTHLY trying to change plan → 422', async () => {
    const { user, accessToken } = await createTestUser();
    userIds.push(user.id);
    const sub = await createTestSubscription(user.id, 'PREMIUM_MONTHLY', 'ACTIVE');
    const res = await makeUpgradeRequest(sub.id, accessToken, 'BASIC');
    expect(res.status).toBe(422);
  });

  it('positive control: ACTIVE + BASIC → PREMIUM_MONTHLY succeeds → 2xx', async () => {
    const { user, accessToken } = await createTestUser();
    userIds.push(user.id);
    const sub = await createTestSubscription(user.id, 'BASIC', 'ACTIVE');
    const res = await makeUpgradeRequest(sub.id, accessToken, 'PREMIUM_MONTHLY');
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });

  it('positive control: ACTIVE TRIALING + BASIC → PREMIUM_MONTHLY succeeds → 2xx', async () => {
    const { user, accessToken } = await createTestUser();
    userIds.push(user.id);
    const sub = await createTestSubscription(user.id, 'BASIC', 'TRIALING');
    const res = await makeUpgradeRequest(sub.id, accessToken, 'PREMIUM_MONTHLY');
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });

  it('positive control: ACTIVE + PREMIUM_WEEKLY → PREMIUM_MONTHLY succeeds → 2xx', async () => {
    const { user, accessToken } = await createTestUser();
    userIds.push(user.id);
    const sub = await createTestSubscription(user.id, 'PREMIUM_WEEKLY', 'ACTIVE');
    const res = await makeUpgradeRequest(sub.id, accessToken, 'PREMIUM_MONTHLY');
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });
});
