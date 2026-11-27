import { Equals, ValidateBy } from 'class-validator';
import { ConsentSubmission } from '../data-rights/consent.js';

export class SignupConsentSubmission extends ConsentSubmission {
  @Equals(true) ageConfirmed: boolean;
}

export const RequiredSkills = () => ValidateBy({
  name: 'requiredSkills',
  validator: {
    validate(value: unknown) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const groups = Object.values(value);
      return groups.length > 0 && groups.every(group => Array.isArray(group) && group.length > 0 &&
        group.every(skill => typeof skill === 'string' && skill.trim().length > 0));
    },
    defaultMessage: () => 'Select at least one skill for each group.',
  },
});
