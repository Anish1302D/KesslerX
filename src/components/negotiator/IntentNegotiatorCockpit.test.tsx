import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import IntentNegotiatorCockpit, { NegotiationData } from './IntentNegotiatorCockpit';

const mockNegotiationData: NegotiationData = {
  event_id: 'EVT-TEST',
  primary_object: 'STARLINK-3021',
  secondary_object: 'DEBRIS-88172',
  current_miss_km: 0.12,
  collision_probability: 0.098,
  tca_utc: '2026-08-05T18:40:00Z',
  operational_recommendation: 'Critical conjunction at T-14h. Execute retrograde burn on STARLINK-3021.',
  disclaimer: 'Decision support only — human approval required. Not a flight command system.',
  candidates: [
    {
      id: 'OPT-1-MANEUVER-A',
      action_type: 'MANEUVER_A',
      title: 'Execute Avoidance Burn on STARLINK-3021',
      target_object: 'STARLINK-3021',
      burn_direction: 'RETROGRADE',
      delta_v_m_s: 0.45,
      burn_duration_seconds: 14.5,
      fuel_cost_kg: 0.12,
      expected_miss_km: 45.1,
      time_to_tca_hours: 14.0,
      risk_reduction_score: 95.0,
      fuel_efficiency_score: 92.0,
      mission_continuity_score: 70.0,
      confidence_score: 90.0,
      composite_score: 89.5,
      recommended: true,
      trade_off_summary: 'Achieves highest safety margin. Consumes 0.12 kg hydrazine.',
      disclaimer: 'Decision support only — human approval required.',
    },
    {
      id: 'OPT-2-MANEUVER-B',
      action_type: 'MANEUVER_B',
      title: 'Request Avoidance Burn on DEBRIS-88172',
      target_object: 'DEBRIS-88172',
      delta_v_m_s: 0.0,
      burn_duration_seconds: 0.0,
      fuel_cost_kg: 0.0,
      expected_miss_km: 0.12,
      time_to_tca_hours: 14.0,
      risk_reduction_score: 0.0,
      fuel_efficiency_score: 100.0,
      mission_continuity_score: 100.0,
      confidence_score: 99.0,
      composite_score: 15.0,
      recommended: false,
      trade_off_summary: 'Infeasible: non-maneuverable debris.',
      disclaimer: 'Decision support only — human approval required.',
    },
    {
      id: 'OPT-3-SENSOR-TASKING',
      action_type: 'SENSOR_TASKING',
      title: 'Task Space Surveillance Network Radar',
      target_object: 'Both Objects',
      delta_v_m_s: 0.0,
      burn_duration_seconds: 0.0,
      fuel_cost_kg: 0.0,
      expected_miss_km: 0.12,
      time_to_tca_hours: 14.0,
      risk_reduction_score: 65.0,
      fuel_efficiency_score: 100.0,
      mission_continuity_score: 100.0,
      confidence_score: 94.0,
      composite_score: 78.5,
      recommended: false,
      trade_off_summary: 'Zero propellant consumed. Obtains radar pass.',
      disclaimer: 'Decision support only — human approval required.',
    },
    {
      id: 'OPT-4-HOLD-RESCREEN',
      action_type: 'HOLD_RESCREEN',
      title: 'Hold Maneuver & Re-screen at Next TLE Batch',
      target_object: 'Pair',
      delta_v_m_s: 0.0,
      burn_duration_seconds: 0.0,
      fuel_cost_kg: 0.0,
      expected_miss_km: 0.12,
      time_to_tca_hours: 14.0,
      risk_reduction_score: 20.0,
      fuel_efficiency_score: 100.0,
      mission_continuity_score: 100.0,
      confidence_score: 70.0,
      composite_score: 30.0,
      recommended: false,
      trade_off_summary: 'High risk to hold.',
      disclaimer: 'Decision support only — human approval required.',
    },
    {
      id: 'OPT-5-ESCALATE-SAFETY',
      action_type: 'ESCALATE',
      title: 'Escalate to Flight Director & Safety Lead',
      target_object: 'Flight Director',
      delta_v_m_s: 0.0,
      burn_duration_seconds: 0.0,
      fuel_cost_kg: 0.0,
      expected_miss_km: 0.12,
      time_to_tca_hours: 14.0,
      risk_reduction_score: 80.0,
      fuel_efficiency_score: 90.0,
      mission_continuity_score: 85.0,
      confidence_score: 90.0,
      composite_score: 84.5,
      recommended: false,
      trade_off_summary: 'Transfers oversight to Flight Director.',
      disclaimer: 'Decision support only — human approval required.',
    },
    {
      id: 'OPT-6-INSUFFICIENT-DATA',
      action_type: 'INSUFFICIENT_DATA',
      title: 'Flag as Insufficient Ephemeris Fidelity',
      target_object: 'Catalog Audit',
      delta_v_m_s: 0.0,
      burn_duration_seconds: 0.0,
      fuel_cost_kg: 0.0,
      expected_miss_km: 0.12,
      time_to_tca_hours: 14.0,
      risk_reduction_score: 50.0,
      fuel_efficiency_score: 100.0,
      mission_continuity_score: 100.0,
      confidence_score: 50.0,
      composite_score: 45.0,
      recommended: false,
      trade_off_summary: 'Flagged for observational tasking.',
      disclaimer: 'Decision support only — human approval required.',
    },
  ],
};

describe('IntentNegotiatorCockpit', () => {
  it('renders all 6 candidates and safety disclaimer', () => {
    render(<IntentNegotiatorCockpit data={mockNegotiationData} />);
    expect(screen.getByText('Intent-to-Action Negotiator')).toBeDefined();
    expect(screen.getAllByText(/Decision support only — human approval required/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Execute Avoidance Burn on STARLINK-3021').length).toBeGreaterThan(0);
    expect(screen.getByText('Request Avoidance Burn on DEBRIS-88172')).toBeDefined();
    expect(screen.getByText('Task Space Surveillance Network Radar')).toBeDefined();
    expect(screen.getByText('Hold Maneuver & Re-screen at Next TLE Batch')).toBeDefined();
    expect(screen.getByText('Escalate to Flight Director & Safety Lead')).toBeDefined();
    expect(screen.getByText('Flag as Insufficient Ephemeris Fidelity')).toBeDefined();
  });

  it('opens two-person sign-off modal and requires safety confirmation', () => {
    const handleSignOff = vi.fn();
    render(<IntentNegotiatorCockpit data={mockNegotiationData} onSignOff={handleSignOff} />);

    const signOffButton = screen.getByText(/Sign-Off Operational Intent/i);
    fireEvent.click(signOffButton);

    expect(screen.getByText('Two-Person Operational Sign-Off')).toBeDefined();
    const authorizeBtn = screen.getByText('Authorize Decision Support Plan').closest('button') as HTMLButtonElement;
    expect(authorizeBtn.disabled).toBe(true);

    // Check confirmation checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(authorizeBtn.disabled).toBe(false);

    // Click authorize
    fireEvent.click(authorizeBtn);
    expect(handleSignOff).toHaveBeenCalled();
  });
});
