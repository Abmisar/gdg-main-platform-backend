import { Prisma } from '../src/generated/prisma/client.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { RightsService } from '../src/data-rights/rights.service.js';
import { configureHttp } from '../src/configure-http.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ResendAuthEmailService } from '../src/auth/email/resend-auth-email.service.js';

// This suite requires an explicitly selected isolated local database, never a hosted URL.
describe('Better Auth through Nest HTTP', () => {
  let app: NestExpressApplication;
  const sent: Array<{ to: string; kind: string; url: string }> = [];
  const email = `nest-${randomUUID()}@example.test`;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production') throw new Error('Auth e2e requires an isolated local database');
    process.env.BETTER_AUTH_SECRET = 'local-nest-e2e-only-secret-at-least-32-characters';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ResendAuthEmailService).useValue({ send: async (message: typeof sent[number]) => { sent.push(message); } }).compile();
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureHttp(app);
    await app.init();
  });
  afterAll(async () => {
    if (!app) return;
    const db = app.get(PrismaService);
    const person = await db.person.findFirst({ where: { emailPersonal: email } });
    if (person) {
      await db.nonMemberRegistration.deleteMany({ where: { personId: person.personId } });
      await db.pendingSignup.deleteMany({ where: { personId: person.personId } });
      await db.personEmailIdentity.deleteMany({ where: { personId: person.personId } });
      await db.person.delete({ where: { personId: person.personId } });
    }
    await db.signupVerification.deleteMany({ where: { emailPersonal: email } });
    await db.authUser.deleteMany({ where: { email } });
    await app.close();
  });
  it('stages signup, requires verification, serves authenticated profile and revokes logout', async () => {
    const http = request(app.getHttpServer());
    await http.get('/me').expect(401);
    const input = {
      consent: { privacy: '2', terms: '2', locale: 'en' },
      fullName: 'Synthetic Nest signup', email, password: 'local-e2e-password', locale: 'en', ageConfirmed: true, registrationType: 'NON_MEMBER',
      applicationData: { phoneNumber: '0500000000', university: 'University of Jeddah', college: 'Computing', major: 'CS', branch: 'Main', skillsByCommittee: { GENERAL: ['Planning'] }, level: '1', gender: 'female' },
    };
    const lookup = () => http.post('/account/check-email').send({ email }).expect(200);
    expect((await lookup()).body.data).toEqual({ nextStep: 'PASSWORD_REQUIRED' });
    await http.post('/api/auth/sign-up/email').set('Origin', 'http://localhost:3000').send(input).expect(404);
    const signup = () => http.post('/account/signup').set('Origin', 'http://localhost:3000');
    const current = await http.get('/consent/documents').expect(200);
    expect(current.body.data).toEqual({ privacy: '2', terms: '2' });
    await signup().send({ ...input, consent: undefined }).expect(400);
    await signup().send({ ...input, consent: { ...input.consent, terms: 'old' } }).expect(400);
    await signup().send({ ...input, email: 'minor-' + email, ageConfirmed: false }).expect(400);
    await signup().send({ ...input, email: 'missing-age-' + email, ageConfirmed: undefined }).expect(400);
    const receipt = (await signup().send(input).expect(201)).body;
    expect(receipt).toEqual({ success: true, message: 'OK', error: null, data: { emailVerificationRequired: true } });
    await vi.waitFor(() => expect(sent.some(message => message.kind === 'verification' && message.to === email)).toBe(true));
    const duplicate = await signup().send({ ...input, fullName: 'Duplicate submission', password: 'other-example-password' }).expect(201);
    expect(duplicate.body).toEqual(receipt);
    expect(sent.filter(message => message.kind === 'verification' && message.to === email)).toHaveLength(1);
    await http.post('/api/auth/sign-in/email').set('Origin', 'http://localhost:3000').send({ email, password: 'local-e2e-password' }).expect(403);
    const staged = await app.get(PrismaService).signupVerification.findUniqueOrThrow({ where: { emailPersonal: email } });
    expect(staged.consentEvidence).toContainEqual(expect.objectContaining({ purpose: 'age_18_or_older', version: '2' }));
    await app.get(PrismaService).signupVerification.update({ where: { emailPersonal: email }, data: { consentEvidence: Prisma.DbNull } });
    const link = new URL(sent.find(message => message.kind === 'verification')!.url);
    await http.get(link.pathname + link.search).expect(302);
    const login = await http.post('/api/auth/sign-in/email').set('Origin', 'http://localhost:3000').send({ email, password: 'local-e2e-password' }).expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).map(value => value.split(';')[0]).join('; ');
    const profile = await http.get('/me').set('Cookie', cookie).expect(200).expect('Cache-Control', 'private, no-store');
    await http.get('/api/auth/get-session').set('Cookie', cookie).expect(200).expect('Cache-Control', 'private, no-store');
    await http.get('/api/auth/get-session').expect(200).expect('Cache-Control', 'private, no-store');
    expect((await lookup()).body.data).toEqual({ nextStep: 'PASSWORD_REQUIRED' });
    expect(profile.body.data.fullName).toBe(input.fullName);
    expect(profile.body.data.email).toBe(email);
    expect(profile.body.data.roles).toEqual([]);
    expect(profile.body.data.memberId).toBeNull();
    await http.patch('/me/bio').set('Cookie', cookie).set('Origin', 'https://attacker.invalid').send({ bio: 'denied' }).expect(403);
    await http.get('/me/export').expect(401);
    await http.get('/me/data-requests').expect(401);
    await http.get('/me/deletion').expect(401);
    const ownRequest = http.post('/me/data-requests').set('Cookie', cookie).set('Origin', 'http://localhost:3000');
    const filed = await ownRequest.send({ kind: 'other', details: 'Synthetic privacy question' }).expect(201);
    expect(filed.body.data).toMatchObject({ status: 'OPEN', details: 'Synthetic privacy question' });
    const own = await http.get('/me/data-requests').set('Cookie', cookie).expect(200);
    expect(own.body.data).toEqual([filed.body.data]);
    expect((await http.get('/me/deletion').set('Cookie', cookie).expect(200)).body.data).toBeNull();
    const initialConsent = await http.get('/me/consent').set('Cookie', cookie).expect(200);
    expect(initialConsent.body.data).toMatchObject({ requiresConsent: true, missing: ['privacy', 'terms'] });
    await http.get('/me/export').set('Cookie', cookie).expect(200);
    const renewed = await http.post('/me/consent').set('Cookie', cookie).set('Origin', 'http://localhost:3000').send({ consent: input.consent }).expect(201);
    expect(renewed.body.data).toMatchObject({ requiresConsent: false, missing: [] });
    const exported = await http.get('/me/export').set('Cookie', cookie).expect(200);
    expect(exported.body.data.consents).toHaveLength(2);
    expect(exported.body.data.consents[0].ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.body.data.rightsAudit.at(-1).action).toBe('export');
    expect(exported.body.data.account.accounts[0]).not.toHaveProperty('password');
    await http.patch('/me/profile').set('Cookie', cookie).set('Origin', 'http://localhost:3000').send({ major: 'Synthetic Major' }).expect(200);
    await http.get('/leadership/data-requests').set('Cookie', cookie).expect(403);
    const database = app.get(PrismaService);
    const member = await database.member.create({ data: { personId: exported.body.data.personId } });
    const role = await database.memberRole.create({ data: { memberId: member.memberId, roleCode: 'GROUP_CO_LEADER' } });
    try {
      const logged = await http.post('/leadership/data-requests').set('Cookie', cookie).set('Origin', 'http://localhost:3000')
        .send({ kind: 'complaint', personId: exported.body.data.personId, receivedAt: '2024-01-01T12:00:00Z' }).expect(201);
      expect(logged.body.data.dueAt).toBe('2024-01-31T12:00:00.000Z');
      await http.patch(`/leadership/data-requests/${logged.body.data.id}`).set('Cookie', cookie).set('Origin', 'http://localhost:3000')
        .send({ status: 'RESOLVED', resolution: 'Synthetic resolution' }).expect(200);
      const bundle = await http.get('/me/export').set('Cookie', cookie).expect(200);
      expect(bundle.body.data.subjectRequests).toContainEqual(expect.objectContaining({ id: logged.body.data.id, status: 'RESOLVED' }));
    } finally {
      await database.memberRole.delete({ where: { id: role.id } });
      await database.member.delete({ where: { memberId: member.memberId } });
    }
    const submit = () => http.post('/me/data-requests').set('Cookie', cookie).set('Origin', 'http://localhost:3000').send({ kind: 'other' });
    for (let i = 0; i < 4; i++) await submit().expect(201);
    await submit().expect(429);
    const deletion = await http.post('/me/deletion').set('Cookie', cookie).set('Origin', 'http://localhost:3000').expect(201);
    expect((await http.get('/me/deletion').set('Cookie', cookie).expect(200)).body.data).toEqual(deletion.body.data);
    expect(Date.parse(deletion.body.data.dueAt) - Date.now()).toBeCloseTo(14 * 86400000, -4);
    await http.delete('/me/deletion').set('Cookie', cookie).set('Origin', 'http://localhost:3000').expect(200);
    await http.post('/api/auth/sign-out').set('Cookie', cookie).set('Origin', 'http://localhost:3000').send({}).expect(200);
    await http.get('/me').set('Cookie', cookie).expect(401);
    const second = await http.post('/api/auth/sign-in/email').set('Origin', 'http://localhost:3000').send({ email, password: input.password }).expect(200);
    const activeCookie = (second.headers['set-cookie'] as unknown as string[]).map(value => value.split(';')[0]).join('; ');
    await http.post('/me/deletion').set('Cookie', activeCookie).set('Origin', 'http://localhost:3000').expect(201);
    const personId = exported.body.data.personId;
    const db = app.get(PrismaService);
    const rights = app.get(RightsService);
    await rights.purgePersonIfDue(personId);
    expect(await db.person.findUnique({ where: { personId } })).toBeTruthy();
    const count = await db.deletionTombstone.count();
    await db.accountDeletion.update({ where: { personId }, data: { dueAt: new Date(0) } });
    await Promise.all([rights.purgePersonIfDue(personId), rights.purgePersonIfDue(personId)]);
    expect(await db.deletionTombstone.count()).toBe(count + 1);
    expect(await db.person.findUnique({ where: { personId } })).toBeNull();
    expect(await db.authUser.findUnique({ where: { email } })).toBeNull();
    await http.get('/me').set('Cookie', activeCookie).expect(401);
  });
});
