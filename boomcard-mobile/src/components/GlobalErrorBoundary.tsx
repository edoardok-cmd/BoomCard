import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { reportError } from '../utils/errorReporter';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const combined = new Error(error.message);
    combined.stack = [error.stack, info.componentStack].filter(Boolean).join('\n\n--- React tree ---\n\n');
    reportError(combined, 'render_error');
  }

  handleRetry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Нещо се обърка</Text>
        <Text style={styles.body}>Приложението срещна неочакван проблем. Грешката беше регистрирана автоматично.</Text>
        <TouchableOpacity style={styles.btn} onPress={this.handleRetry}>
          <Text style={styles.btnText}>Опитай отново</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#faf9f5',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  title: {
    fontSize: 20, fontWeight: '700', color: '#141413', marginBottom: 12, textAlign: 'center',
  },
  body: {
    fontSize: 14, color: '#605a50', textAlign: 'center', marginBottom: 24, lineHeight: 22,
  },
  btn: {
    backgroundColor: '#c96442', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
