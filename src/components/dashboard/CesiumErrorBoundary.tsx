import React, { Component, ErrorInfo, ReactNode } from 'react';
import GlobeFallbackTable, { SatelliteItem } from './GlobeFallbackTable';

interface Props {
  children: ReactNode;
  satellites: SatelliteItem[];
  onSelectObject?: (sat: SatelliteItem | null) => void;
  selectedObject?: SatelliteItem | null;
  filters?: Record<string, boolean>;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  retryCount: number;
}

export class CesiumErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error.message || 'Cesium / WebGL rendering context failure',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CesiumErrorBoundary caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      errorMessage: '',
      retryCount: prev.retryCount + 1,
    }));
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <GlobeFallbackTable
          satellites={this.props.satellites}
          onSelectObject={this.props.onSelectObject}
          selectedObject={this.props.selectedObject}
          reason={`3D Globe crashed: ${this.state.errorMessage}`}
          onRetry3D={this.handleRetry}
          filters={this.props.filters}
        />
      );
    }

    return (
      <React.Fragment key={this.state.retryCount}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

export default CesiumErrorBoundary;
