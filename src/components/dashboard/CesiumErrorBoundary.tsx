import React, { Component, ErrorInfo, ReactNode } from 'react';
import GlobeFallbackTable, { SatelliteItem } from './GlobeFallbackTable';

interface Props {
  children: ReactNode;
  satellites: SatelliteItem[];
  onSelectObject?: (sat: SatelliteItem | null) => void;
  selectedObject?: SatelliteItem | null;
  filters?: Record<string, boolean>;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class CesiumErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Cesium / WebGL rendering context failure',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CesiumErrorBoundary caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
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

    return this.props.children;
  }
}

export default CesiumErrorBoundary;

