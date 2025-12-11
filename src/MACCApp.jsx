import React from "react";
import MACCAppInner from "./components/MACCAppInner";

// The outer ErrorBoundary remains here
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err, info) {
    console.error(err, info);
  }

  render() {
    return this.state.hasError ? <div className="p-6 text-red-600 bg-red-100 rounded-xl">An application error occurred. Please refresh or check the console.</div> : this.props.children;
  }
}

export default function MACCApp() {
  return (
    <ErrorBoundary>
      <MACCAppInner />
    </ErrorBoundary>
  );
}