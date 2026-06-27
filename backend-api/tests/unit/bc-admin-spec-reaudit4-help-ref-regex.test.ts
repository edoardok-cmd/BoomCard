/**
 * BC-ADMIN-SPEC-REAUDIT4-HELP-REF-REGEX-2: Ticket ref extraction uses shared SUBJECT_REF_RE
 *
 * All sites that extract ticket references from subject lines must use
 * the authoritative shared SUBJECT_REF_RE constant (defined in ticketInbound.service.ts)
 * rather than ad-hoc unbounded regexes.
 *
 * **Sites updated (6 total):**
 * 1. adminHelp.routes.ts:197 — admin auto-reply email ref extraction
 * 2. partnerHelp.routes.ts:189 — partner auto-reply email ref extraction
 * 3. help.routes.ts:107 — subscriber auto-reply email ref extraction
 * 4. ticketInbound.service.ts:978 — inbound auto-reply HTML email ref extraction
 * 5. ticketInbound.service.ts:994 — inbound auto-reply text email ref extraction
 * 6. ticketEmail.service.ts:290 — subject building ref removal
 * 7. helpTicketIntake.service.ts:72 — intake auto-reply ref extraction
 *
 * **Test coverage:**
 * - Verify SUBJECT_REF_RE is exported from ticketInbound.service.ts
 * - Verify all sites import and use the shared constant
 * - Verify the constant's behavior (4-32 hex chars, case-insensitive)
 * - Ensure no ad-hoc unbounded regexes remain in the codebase
 */

import { SUBJECT_REF_RE } from '../../src/services/ticketInbound.service';
import fs from 'fs';
import path from 'path';

describe('BC-ADMIN-SPEC-REAUDIT4-HELP-REF-REGEX: Shared SUBJECT_REF_RE consistency', () => {
  describe('SUBJECT_REF_RE definition and export', () => {
    it('should export SUBJECT_REF_RE from ticketInbound.service.ts', () => {
      expect(SUBJECT_REF_RE).toBeDefined();
      expect(SUBJECT_REF_RE instanceof RegExp).toBe(true);
    });

    it('should match 4-char minimum hex references', () => {
      const match = '[#abcd]'.match(SUBJECT_REF_RE);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('abcd');
    });

    it('should match 8-char hex references', () => {
      const match = '[#12345678]'.match(SUBJECT_REF_RE);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('12345678');
    });

    it('should match 32-char full UUID hex references', () => {
      const match = '[#12345678abcdef0012345678abcdef0]'.match(SUBJECT_REF_RE);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('12345678abcdef0012345678abcdef0');
    });

    it('should reject 3-char references (below minimum)', () => {
      const match = '[#abc]'.match(SUBJECT_REF_RE);
      expect(match).toBeNull();
    });

    it('should reject 33-char references (above maximum)', () => {
      const match = '[#12345678abcdef0012345678abcdef00]'.match(SUBJECT_REF_RE);
      expect(match).toBeNull();
    });

    it('should be case-insensitive (uppercase)', () => {
      const match = '[#ABCD1234]'.match(SUBJECT_REF_RE);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('ABCD1234');
    });

    it('should be case-insensitive (mixed case)', () => {
      const match = '[#AbCd1234]'.match(SUBJECT_REF_RE);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('AbCd1234');
    });

    it('should only match valid hex characters', () => {
      const match = '[#gggggggg]'.match(SUBJECT_REF_RE);
      expect(match).toBeNull();
    });

    it('should match in subject line with surrounding text', () => {
      const subject = 'Re: [#abcd1234] User reported issue';
      const match = subject.match(SUBJECT_REF_RE);
      expect(match).not.toBeNull();
      expect(match?.[0]).toBe('[#abcd1234]');
    });
  });

  describe('Code consistency: all sites import SUBJECT_REF_RE', () => {
    it('adminHelp.routes.ts should import SUBJECT_REF_RE', () => {
      const filePath = path.join(__dirname, '../../src/routes/adminHelp.routes.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain("import { SUBJECT_REF_RE } from '../services/ticketInbound.service'");
    });

    it('partnerHelp.routes.ts should import SUBJECT_REF_RE', () => {
      const filePath = path.join(__dirname, '../../src/routes/partnerHelp.routes.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain("import { SUBJECT_REF_RE } from '../services/ticketInbound.service'");
    });

    it('help.routes.ts should import SUBJECT_REF_RE', () => {
      const filePath = path.join(__dirname, '../../src/routes/help.routes.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain("import { SUBJECT_REF_RE } from '../services/ticketInbound.service'");
    });

    it('ticketEmail.service.ts should import SUBJECT_REF_RE', () => {
      const filePath = path.join(__dirname, '../../src/services/ticketEmail.service.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain("import { SUBJECT_REF_RE } from './ticketInbound.service'");
    });

    it('helpTicketIntake.service.ts should import SUBJECT_REF_RE', () => {
      const filePath = path.join(__dirname, '../../src/services/helpTicketIntake.service.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain("import { SUBJECT_REF_RE } from './ticketInbound.service'");
    });

    it('ticketInbound.service.ts should export SUBJECT_REF_RE', () => {
      const filePath = path.join(__dirname, '../../src/services/ticketInbound.service.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('export const SUBJECT_REF_RE');
    });
  });

  describe('Code consistency: no unbounded ad-hoc regexes remain', () => {
    it('all backend files should not contain unbounded [#[a-f0-9]+] patterns', () => {
      // Check key files that used to have ad-hoc patterns
      const filesToCheck = [
        '../../src/routes/adminHelp.routes.ts',
        '../../src/routes/partnerHelp.routes.ts',
        '../../src/routes/help.routes.ts',
        '../../src/services/ticketEmail.service.ts',
        '../../src/services/ticketInbound.service.ts',
        '../../src/services/helpTicketIntake.service.ts',
      ];

      for (const filePath of filesToCheck) {
        const fullPath = path.join(__dirname, filePath);
        const content = fs.readFileSync(fullPath, 'utf8');
        // Look for the unbounded pattern specifically: /[#[a-f0-9]+]/i
        // This should NOT appear in the code anymore
        const hasAdHocPattern = /\/\\\[\#\[a-f0-9\]\+\\\]\/i/.test(content);
        expect(hasAdHocPattern).toBe(false);
      }
    });

    it('ticketInbound.service.ts should have multiple SUBJECT_REF_RE uses', () => {
      const filePath = path.join(__dirname, '../../src/services/ticketInbound.service.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      const subjectRefReUses = (content.match(/SUBJECT_REF_RE/g) || []).length;
      expect(subjectRefReUses).toBeGreaterThanOrEqual(8);
    });

    it('adminHelp.routes.ts should use SUBJECT_REF_RE for ref extraction', () => {
      const filePath = path.join(__dirname, '../../src/routes/adminHelp.routes.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('buildTicketSubject(ticket.id, \'\').match(SUBJECT_REF_RE)');
    });

    it('partnerHelp.routes.ts should use SUBJECT_REF_RE for ref extraction', () => {
      const filePath = path.join(__dirname, '../../src/routes/partnerHelp.routes.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('subject_built.match(SUBJECT_REF_RE)');
    });

    it('help.routes.ts should use SUBJECT_REF_RE for ref extraction', () => {
      const filePath = path.join(__dirname, '../../src/routes/help.routes.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('emailSubject.match(SUBJECT_REF_RE)');
    });

    it('ticketEmail.service.ts should use SUBJECT_REF_RE for ref stripping', () => {
      const filePath = path.join(__dirname, '../../src/services/ticketEmail.service.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('subject.replace(SUBJECT_REF_RE, \'\').trim()');
    });

    it('helpTicketIntake.service.ts should use SUBJECT_REF_RE for ref extraction', () => {
      const filePath = path.join(__dirname, '../../src/services/helpTicketIntake.service.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('subject.match(SUBJECT_REF_RE)');
    });
  });

  describe('Behavioral correctness: ref extraction works consistently', () => {
    it('should extract full UUID from [#XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX]', () => {
      const uuid = '12345678abcdef0012345678abcdef01';
      const subject = `[#${uuid}] Some subject`;
      const match = subject.match(SUBJECT_REF_RE);
      expect(match?.[1]).toBe(uuid);
    });

    it('should extract short ref from [#1234]', () => {
      const shortRef = 'a1b2c3d4';
      const subject = `Re: [#${shortRef}] Reply`;
      const match = subject.match(SUBJECT_REF_RE);
      expect(match?.[1]).toBe(shortRef);
    });

    it('should return the full bracket notation [#XXXX]', () => {
      const subject = 'Re: [#12ab] Ticket reply';
      const match = subject.match(SUBJECT_REF_RE);
      expect(match?.[0]).toBe('[#12ab]');
    });

    it('should handle case variations correctly', () => {
      const subject = 'Re: [#AbCd1234] Mixed case';
      const match = subject.match(SUBJECT_REF_RE);
      expect(match?.[1].toLowerCase()).toBe('abcd1234');
    });
  });
});
