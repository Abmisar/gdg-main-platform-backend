export interface Field {
  column: string;
  index?: boolean;
  json?: boolean;
}
export interface Storage {
  table: string;
  pk: string;
  fields: Record<string, Field>;
}
export const storage: Record<string, Storage> = {
  ManualRightsRequest: {
    table: 'manual_rights_request',
    pk: 'id',
    fields: {
      contactEmail: { column: 'contact_email', index: true },
      details: { column: 'details' },
      resolution: { column: 'resolution' },
    },
  },
  Person: {
    table: 'person',
    pk: 'person_id',
    fields: {
      fullName: { column: 'full_name' },
      emailPersonal: { column: 'email_personal', index: true },
      emailUniversity: { column: 'email_university', index: true },
      phoneNumber: { column: 'phone_number', index: true },
      university: { column: 'university' },
      branch: { column: 'branch' },
      major: { column: 'major' },
      gender: { column: 'gender' },
      profileImageUrl: { column: 'profile_image_url' },
      bio: { column: 'bio' },
      githubUrl: { column: 'github_url' },
      portfolioUrl: { column: 'portfolio_url' },
      xUrl: { column: 'x_url' },
    },
  },
  MemberRole: {
    table: 'member_role',
    pk: 'id',
    fields: {
      notes: { column: 'notes' },
    },
  },
  MembershipRequest: {
    table: 'membership_request',
    pk: 'membership_request_id',
    fields: {
      applicationData: { column: 'application_data', json: true },
    },
  },
  NonMemberRegistration: {
    table: 'non_member_registration',
    pk: 'non_member_registration_id',
    fields: {
      applicationData: { column: 'application_data', json: true },
    },
  },
  EmailVerificationChallenge: {
    table: 'email_verification_challenge',
    pk: 'email_verification_challenge_id',
    fields: {
      email: { column: 'email' },
    },
  },
  PendingSignup: {
    table: 'pending_signup',
    pk: 'pending_signup_id',
    fields: {
      applicationData: { column: 'application_data', json: true },
    },
  },
  SignupVerification: {
    table: 'signup_verification',
    pk: 'signup_verification_id',
    fields: {
      fullName: { column: 'full_name' },
      emailPersonal: { column: 'email_personal', index: true },
      emailUniversity: { column: 'email_university' },
      applicationData: { column: 'application_data', json: true },
    },
  },
  PersonEmailIdentity: {
    table: 'person_email_identity',
    pk: 'person_email_identity_id',
    fields: {
      email: { column: 'email', index: true },
    },
  },
  CommitteeTask: {
    table: 'committee_task',
    pk: 'task_id',
    fields: {
      title: { column: 'title' },
      description: { column: 'description' },
    },
  },
  CommitteePointEntry: {
    table: 'committee_point_entry',
    pk: 'point_entry_id',
    fields: {
      reason: { column: 'reason' },
    },
  },
  GlobalPointEntry: {
    table: 'global_point_entry',
    pk: 'point_entry_id',
    fields: {
      reason: { column: 'reason' },
    },
  },
  EventRegistration: {
    table: 'event_registrations',
    pk: 'registration_id',
    fields: {
      excuseReason: { column: 'excuse_reason' },
    },
  },
  RegistrationAnswer: {
    table: 'registration_answers',
    pk: 'answer_id',
    fields: {
      answerText: { column: 'answer_text' },
    },
  },
  RegistrationBlacklistEntry: {
    table: 'registration_blacklist_entries',
    pk: 'entry_id',
    fields: {
      resolutionReason: { column: 'resolution_reason' },
    },
  },
  AuthUser: {
    table: 'auth_user',
    pk: 'id',
    fields: {
      name: { column: 'name' },
      email: { column: 'email', index: true },
      image: { column: 'image' },
    },
  },
  AuthSession: {
    table: 'auth_session',
    pk: 'id',
    fields: {
      ipAddress: { column: 'ipAddress' },
      userAgent: { column: 'userAgent' },
    },
  },
  AuthAccount: {
    table: 'auth_account',
    pk: 'id',
    fields: {
      accessToken: { column: 'accessToken' },
      refreshToken: { column: 'refreshToken' },
      idToken: { column: 'idToken' },
    },
  },
  AuthVerification: {
    table: 'auth_verification',
    pk: 'id',
    fields: {
      identifier: { column: 'identifier', index: true },
      value: { column: 'value', index: true },
    },
  },
  BetterAuthRateLimit: {
    table: 'better_auth_rate_limit',
    pk: 'id',
    fields: {
      key: { column: 'key', index: true },
    },
  },
};
