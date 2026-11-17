import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrbitalCommonsCockpit from './OrbitalCommonsCockpit';
import {
  type CommonsRequest,
  type CommonsResult,
  ORBITAL_COMMONS_DISCLAIMER,
  ORBITAL_COMMONS_PROTOTYPE_WARNING,
  buildDemoCommonsRequest,
  computeOfflineFallbackCommons,
} from '../../utils/orbitalCommons';

// Mock UserContext so component test runs isolated cleanly
vi.mock('../handoff/UserContext', () => ({
  useCurrentUser: () => ({
    currentUser: { user_id: 'anish', name: 'Anish', role: 'mission operations lead' },
    allUsers: [
      { user_id: 'anish', name: 'Anish', role: 'mission operations lead' },
      { user_id: 'sarah', name: 'Sarah', role: 'safety analyst' },
    ],
    setCurrentUser: vi.fn(),
    loading: false,
  }),
}));

describe('OrbitalCommonsCockpit', () => {
  let fairResult: CommonsResult;
  let fuelResult: CommonsResult;

  beforeEach(async () => {
    fairResult = await computeOfflineFallbackCommons(
      buildDemoCommonsRequest('FAIR_BURDEN_SHARING', 'MULTI_OP'),
    );
    fuelResult = await computeOfflineFallbackCommons(
      buildDemoCommonsRequest('MINIMUM_FUEL', 'MULTI_OP'),
    );
  });

  it('renders safety disclaimer, prototype warning, all 7 candidates, counterfactual, and NO Execute Maneuver button', () => {
    render(<OrbitalCommonsCockpit initialResult={fairResult} />);

    // Safety warning and disclaimer always appear
    expect(screen.getAllByText(new RegExp(ORBITAL_COMMONS_DISCLAIMER, 'i')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Research prototype\. Decision support only/i).length).toBeGreaterThan(0);
    expect(ORBITAL_COMMONS_PROTOTYPE_WARNING.length).toBeGreaterThan(10);

    // No Execute Maneuver button ever exists
    expect(screen.queryByRole('button', { name: /execute maneuver/i })).toBeNull();
    expect(screen.getByText(/Command Execution: DISABLED/i)).toBeTruthy();

    // All 7 candidate IDs rendered
    expect(screen.getAllByText('OPT-1-MANEUVER-PRIMARY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPT-2-MANEUVER-SECONDARY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPT-3-ADDITIONAL-TRACKING').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPT-4-HOLD-RESCREEN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPT-5-COORDINATED-SPLIT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPT-6-ESCALATE-SAFETY-LEAD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPT-7-INSUFFICIENT-DATA').length).toBeGreaterThan(0);

    // Counterfactual & rejected reason visible
    expect(screen.getByText(/What happens if no action is taken\?/i)).toBeTruthy();
    expect(
      screen.getByText(/Residual or induced secondary risk exceeds configured safety limit/i),
    ).toBeTruthy();
  });

  it('switches optimization policy tabs and updates recommendation cleanly', async () => {
    const onEvaluateMock = vi.fn(async (req: CommonsRequest) => {
      if (req.policy === 'MINIMUM_FUEL') return fuelResult;
      return fairResult;
    });

    render(<OrbitalCommonsCockpit initialResult={fairResult} onEvaluateOverride={onEvaluateMock} />);

    const minFuelTab = screen.getByRole('tab', { name: /Minimum Fuel/i });
    fireEvent.click(minFuelTab);

    await waitFor(() => {
      expect(onEvaluateMock).toHaveBeenCalledTimes(1);
    });
    expect(onEvaluateMock.mock.calls[0][0].policy).toBe('MINIMUM_FUEL');
    await waitFor(() => {
      expect(screen.getByText(/Recommended Course of Action \(MINIMUM_FUEL\)/i)).toBeTruthy();
    });
  });

  it('displays SHA-256 hash and toggles canonical evidence JSON drawer', () => {
    render(<OrbitalCommonsCockpit initialResult={fairResult} />);

    const hashNode = screen.getByTestId('audit-sha256-hash');
    expect(hashNode.textContent).toBe(fairResult.audit_hash_sha256);
    expect(screen.queryByTestId('evidence-packet-json')).toBeNull();

    const drawerBtn = screen.getByRole('button', { name: /Inspect Evidence Drawer/i });
    fireEvent.click(drawerBtn);

    const jsonViewer = screen.getByTestId('evidence-packet-json');
    expect(jsonViewer.textContent).toContain(fairResult.audit_hash_sha256);
    expect(jsonViewer.textContent).toContain('canonical_deterministic_evidence');
  });

  it('records first human review via override without executing commands and rejects unacknowledged approval', async () => {
    const approvedResult: CommonsResult = {
      ...fairResult,
      review_state: {
        ...fairResult.review_state,
        status: 'FIRST_REVIEW_COMPLETE',
        selected_candidate_id: 'OPT-5-COORDINATED-SPLIT',
        first_reviewer: {
          reviewer_id: 'anish',
          reviewer_role: 'mission operations lead',
          candidate_id: 'OPT-5-COORDINATED-SPLIT',
          notes: 'Verified split trajectory',
          reviewed_at_utc: '2026-11-17T12:15:00Z',
          safety_acknowledged: true,
        },
        command_executed: false,
      },
    };
    const onApproveMock = vi.fn(async () => approvedResult);

    render(<OrbitalCommonsCockpit initialResult={fairResult} onApproveOverride={onApproveMock} />);

    const ackCheckbox = screen.getByRole('checkbox');
    fireEvent.click(ackCheckbox); // uncheck first to test fail-closed checkbox guard
    fireEvent.click(screen.getByRole('button', { name: /Record 1st Human Review/i }));
    expect(screen.getByRole('alert').textContent).toContain('acknowledge');
    expect(onApproveMock).not.toHaveBeenCalled();

    // Re-check and approve
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: /Record 1st Human Review/i }));

    await waitFor(() => {
      expect(onApproveMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/1st Review Signed/i)).toBeTruthy();
    expect(screen.getAllByText(/No spacecraft command executed/i).length).toBeGreaterThan(0);
  });

  it('supports accessible keyboard candidate selection and tab focusability', () => {
    render(<OrbitalCommonsCockpit initialResult={fairResult} />);

    const splitCandidateButton = screen.getByRole('button', { name: /OPT-5-COORDINATED-SPLIT/i });
    const secondaryCandidateButton = screen.getByRole('button', { name: /OPT-2-MANEUVER-SECONDARY/i });

    expect(splitCandidateButton.getAttribute('aria-pressed')).toBe('true');
    expect(secondaryCandidateButton.getAttribute('aria-pressed')).toBe('false');

    // Keyboard-accessible focus and activation
    secondaryCandidateButton.focus();
    expect(document.activeElement).toBe(secondaryCandidateButton);
    fireEvent.click(secondaryCandidateButton);
    expect(secondaryCandidateButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Selected Candidate Burden Breakdown: OPT-2-MANEUVER-SECONDARY/i)).toBeTruthy();
  });
});
