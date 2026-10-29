import type { CrazyThursdaySkill } from '../core/crazy-thursday.ts';

export type CrazyThursdaySkillProvider = {
    load: () => Promise<CrazyThursdaySkill>;
};
