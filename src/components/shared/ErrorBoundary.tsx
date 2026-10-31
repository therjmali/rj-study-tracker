import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@project/components/ui/button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-destructive/8 border border-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive/80" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-foreground tracking-tight">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
              This section crashed unexpectedly. Try again or reload the page.
            </p>
            {this.state.error && (
              <p className="text-[10px] text-muted-foreground/50 font-mono mt-2 max-w-xs mx-auto truncate">
                {this.state.error.message}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={this.handleRetry}
              className="gap-1.5 text-xs rounded-xl h-9 px-4">
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}
              className="text-xs rounded-xl h-9 px-4 text-muted-foreground">
              Reload Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
