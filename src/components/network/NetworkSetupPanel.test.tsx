import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NetworkSetupPanel, { type NetworkStatusPayload, type FirewallStatusPayload } from './NetworkSetupPanel';
import PhoneSatellitePanel from '../phone/PhoneSatellitePanel';
import { createDefaultPhoneSatelliteData } from '../../utils/phoneSatelliteOrbit';

function createMockNetworkStatus(overrides: Partial<NetworkStatusPayload> = {}): NetworkStatusPayload {
  return {
    mode_preference: 'AUTO',
    active_mode: 'LAPTOP_FALLBACK',
    ground_station_id: 'KX-LAPTOP-FALLBACK-001',
    hardware_model: 'Windows Laptop',
    detected_network: {
      selected_ip: '192.168.137.1',
      selected_interface: 'Local Area Connection* 10',
      network_name: 'KesslerX_MobileHotspot',
      profile_type: 'Private',
      connection_kind: 'hotspot_ap',
      hotspot_active: true,
      subnet_cidr: '192.168.137.0/24',
      hostname: 'Galaxy-Book5',
      interfaces: [
        {
          interface_alias: 'Local Area Connection* 10',
          interface_description: 'Microsoft Wi-Fi Direct Virtual Adapter',
          ip_address: '192.168.137.1',
          prefix_length: 24,
          subnet_cidr: '192.168.137.0/24',
          kind: 'hotspot_ap',
          network_category: 'Private',
          network_name: 'KesslerX_MobileHotspot',
          usable: true,
          priority_score: 120,
        },
        {
          interface_alias: 'Wi-Fi',
          interface_description: 'Intel Wi-Fi 6 AX201',
          ip_address: '10.12.4.88',
          prefix_length: 24,
          subnet_cidr: '10.12.4.0/24',
          kind: 'wifi',
          network_category: 'Private',
          network_name: 'ExpoWiFi',
          usable: true,
          priority_score: 95,
        },
      ],
    },
    raspberry_pi: {
      reachable: false,
      endpoint: null,
      manual_endpoint: null,
      mdns_hostname: 'anishraspberrypizero.local',
      simulator_url: null,
      consecutive_failures: 3,
      failure_threshold: 3,
      recovered_available: false,
      last_checked_at: '2026-11-18T10:00:00Z',
    },
    laptop_fallback: {
      active: true,
      ground_station_id: 'KX-LAPTOP-FALLBACK-001',
      hardware_model: 'Windows Laptop',
      bind_ip: '192.168.137.1',
      http_port: 8766,
      https_port: 8444,
      cert_sans: ['IP:192.168.137.1', 'IP:127.0.0.1'],
      sqlite_buffered_rows: 0,
      packets_accepted: 5,
      packets_forwarded: 5,
      ws_clients: 1,
    },
    simulator: {
      url: 'https://192.168.137.1:8444/simulator',
      url_with_token: 'https://192.168.137.1:8444/simulator?token=demo-token-xyz',
      pairing_token: 'demo-token-xyz',
      pairing_token_expires_at: '2026-11-18T10:15:00Z',
      pairing_required: true,
    },
    backend: {
      url: 'https://kesslerx-backend.onrender.com',
      reachable: true,
      service_status: 'ok',
    },
    warnings: ['Emergency laptop fallback gateway active (physical Raspberry Pi Zero W unavailable).'],
    last_error: null,
    ...overrides,
  };
}

function createMockFirewall(overrides: Partial<FirewallStatusPayload> = {}): FirewallStatusPayload {
  return {
    platform: 'Windows',
    supported: true,
    active_interface_profile: 'Private',
    public_profile_warning: false,
    private_rule_configured: true,
    recommended_command: 'powershell -ExecutionPolicy Bypass -File scripts/setup_windows_firewall.ps1',
    summary: 'Scoped KesslerX Private-network firewall rules detected for ports 8444 / 8766.',
    ...overrides,
  };
}

describe('NetworkSetupPanel & Fallback UI States', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('displays dynamic simulator URL, scannable SVG QR code, and fallback status pills', async () => {
    const netStatus = createMockNetworkStatus();
    const fwStatus = createMockFirewall();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/network/firewall-status')) {
          return new Response(JSON.stringify(fwStatus), { status: 200 });
        }
        return new Response(JSON.stringify(netStatus), { status: 200 });
      })
    );

    render(<NetworkSetupPanel pollIntervalMs={60000} />);

    await waitFor(() => {
      expect(screen.getByText('Laptop Fallback Active (Emergency Mode)')).toBeDefined();
    });
    expect(screen.getByText('Raspberry Pi Unreachable')).toBeDefined();
    expect(screen.getByText('Backend Synced')).toBeDefined();
    expect(screen.getByTestId('generated-simulator-url').textContent).toContain(
      'https://192.168.137.1:8444/simulator?token=demo-token-xyz'
    );

    await waitFor(() => {
      const qrContainer = screen.getByTestId('simulator-qr-code');
      expect(qrContainer.innerHTML).toContain('<svg');
    });
  });

  it('shows recovery banner when Raspberry Pi returns and switches cleanly on confirmation', async () => {
    const recoveredStatus = createMockNetworkStatus({
      raspberry_pi: {
        reachable: true,
        endpoint: 'http://192.168.137.42:8765',
        manual_endpoint: null,
        mdns_hostname: 'anishraspberrypizero.local',
        simulator_url: 'https://192.168.137.42:8443/simulator',
        consecutive_failures: 0,
        failure_threshold: 3,
        recovered_available: true,
        last_checked_at: '2026-11-18T10:02:00Z',
      },
      warnings: [
        'Emergency laptop fallback gateway active (physical Raspberry Pi Zero W unavailable).',
        'Raspberry Pi Zero W is back online on the network. Click Switch to Raspberry Pi when ready.',
      ],
    });
    const switchedPiStatus = createMockNetworkStatus({
      mode_preference: 'PI',
      active_mode: 'PI',
      ground_station_id: 'KX-RPI-ZERO-GS-001',
      hardware_model: 'Raspberry Pi Zero W',
      laptop_fallback: {
        active: false,
        ground_station_id: 'KX-LAPTOP-FALLBACK-001',
        hardware_model: 'Windows Laptop',
        bind_ip: null,
        http_port: 8766,
        https_port: 8444,
        cert_sans: [],
        sqlite_buffered_rows: 0,
        packets_accepted: 0,
        packets_forwarded: 0,
        ws_clients: 0,
      },
      raspberry_pi: {
        reachable: true,
        endpoint: 'http://192.168.137.42:8765',
        manual_endpoint: null,
        mdns_hostname: 'anishraspberrypizero.local',
        simulator_url: 'https://192.168.137.42:8443/simulator',
        consecutive_failures: 0,
        failure_threshold: 3,
        recovered_available: false,
        last_checked_at: '2026-11-18T10:03:00Z',
      },
      simulator: {
        url: 'https://192.168.137.42:8443/simulator',
        url_with_token: 'https://192.168.137.42:8443/simulator',
        pairing_token: null,
        pairing_token_expires_at: null,
        pairing_required: false,
      },
      warnings: [],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/network/mode') && init?.method === 'POST') {
        return new Response(JSON.stringify(switchedPiStatus), { status: 200 });
      }
      if (url.includes('/api/network/firewall-status')) {
        return new Response(JSON.stringify(createMockFirewall()), { status: 200 });
      }
      return new Response(JSON.stringify(recoveredStatus), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NetworkSetupPanel pollIntervalMs={60000} />);

    await waitFor(() => {
      expect(screen.getByTestId('pi-recovery-banner')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Switch to Raspberry Pi/i }));

    await waitFor(() => {
      expect(screen.getByText('Raspberry Pi Ground Station Active')).toBeDefined();
    });
    expect(screen.getByTestId('generated-simulator-url').textContent).toBe(
      'https://192.168.137.42:8443/simulator'
    );
  });

  it('displays Windows Public network warning and renders PHONE SATELLITE fallback indicator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/network/firewall-status')) {
          return new Response(
            JSON.stringify(
              createMockFirewall({
                active_interface_profile: 'Public',
                public_profile_warning: true,
                private_rule_configured: false,
                summary: "Active Wi-Fi/Hotspot network profile is 'Public'. Switch to Private.",
              })
            ),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(createMockNetworkStatus()), { status: 200 });
      })
    );

    const phoneData = createDefaultPhoneSatelliteData();
    phoneData.telemetry = {
      ...phoneData.telemetry,
      sequence: 12,
      packets_received: 12,
      ground_station_id: 'KX-LAPTOP-FALLBACK-001',
      hardware_model: 'Windows Laptop',
      gateway_mode: 'laptop_fallback',
      link_status: 'LIVE_LAPTOP_FALLBACK',
    };

    render(
      <div>
        <NetworkSetupPanel pollIntervalMs={60000} phoneTelemetry={phoneData.telemetry} />
        <PhoneSatellitePanel phoneSatellite={phoneData} defaultExpanded={true} />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByTestId('firewall-public-warning')).toBeDefined();
    });
    expect(screen.getByTestId('phone-fallback-banner')).toBeDefined();
    expect(screen.getByText('GROUND STATION MODE: LAPTOP FALLBACK')).toBeDefined();
    expect(screen.getByText(/RASPBERRY PI: UNAVAILABLE/i)).toBeDefined();
  });

  it('connects Vercel cloud UI automatically to Local Laptop Gateway Agent on 127.0.0.1:8000', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.startsWith('http://127.0.0.1:8000/api/network/firewall-status')) {
          return new Response(JSON.stringify(createMockFirewall()), { status: 200 });
        }
        if (url.startsWith('http://127.0.0.1:8000/api/network/status')) {
          return new Response(JSON.stringify(createMockNetworkStatus()), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 404 });
      })
    );

    render(
      <NetworkSetupPanel
        pollIntervalMs={60000}
        apiBaseUrlOverride="https://kesslerx-backend.onrender.com"
        localAgentUrl="http://127.0.0.1:8000"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('vercel-agent-status')).toBeDefined();
    });
    expect(screen.getByText(/Connected to Local Laptop Gateway Agent/i)).toBeDefined();
    expect(requestedUrls.some((u) => u.startsWith('http://127.0.0.1:8000/api/network/status'))).toBe(true);
  });
});
