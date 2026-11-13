import { describe, it, expect, vi } from 'vitest';
import { generateDebrisReport, type DebrisReportData } from './generateDebrisReport';

const saveMock = vi.fn();

vi.mock('jspdf', () => {
  return {
    default: class MockJsPDF {
      internal = {
        getNumberOfPages: () => 3,
      };
      setFont = vi.fn();
      setFontSize = vi.fn();
      setTextColor = vi.fn();
      setFillColor = vi.fn();
      setDrawColor = vi.fn();
      setLineWidth = vi.fn();
      rect = vi.fn();
      roundedRect = vi.fn();
      line = vi.fn();
      circle = vi.fn();
      text = vi.fn();
      getTextWidth = vi.fn((text: string) => String(text).length * 2);
      splitTextToSize = vi.fn((text: string) => [text]);
      addPage = vi.fn();
      setPage = vi.fn();
      getNumberOfPages = vi.fn(() => 3);
      output = vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' }));
      save = saveMock;
    },
  };
});

describe('generateDebrisReport', () => {
  it('generates and saves a complete Debris Impact Analysis PDF report with collision events', async () => {
    saveMock.mockClear();
    URL.createObjectURL = vi.fn(() => 'blob:mock-pdf-url');
    vi.spyOn(window, 'open').mockReturnValue(null);
    const progressSteps: string[] = [];

    const reportData: DebrisReportData = {
      collisionEvents: [
        {
          id: 1,
          timestamp: 12,
          debrisGenerated: 420,
          debrisWithSystem: 85,
          reductionPercent: 79.8,
          severity: 'CRITICAL',
        },
        {
          id: 2,
          timestamp: 34,
          debrisGenerated: 180,
          debrisWithSystem: 40,
          reductionPercent: 77.8,
          severity: 'HIGH',
        },
      ],
      magnitude: 7.5,
      debrisRate: 2.4,
      timeline: 50,
      simElapsed: 45,
      totalDebrisWithout: 600,
      totalDebrisWith: 125,
      totalReduction: 79.2,
    };

    await generateDebrisReport(reportData, (status) => {
      progressSteps.push(status);
    });

    expect(progressSteps.length).toBeGreaterThan(0);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][0]).toMatch(/^KesslerX_Debris_Impact_Report_SIM-/);
  });

  it('handles zero-collision simulation runs gracefully', async () => {
    saveMock.mockClear();
    URL.createObjectURL = vi.fn(() => 'blob:mock-pdf-url');
    vi.spyOn(window, 'open').mockReturnValue(null);

    const emptyData: DebrisReportData = {
      collisionEvents: [],
      magnitude: 3.0,
      debrisRate: 1.0,
      timeline: 10,
      simElapsed: 10,
      totalDebrisWithout: 0,
      totalDebrisWith: 0,
      totalReduction: 0,
    };

    await generateDebrisReport(emptyData);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
