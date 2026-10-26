export function verifySandbox(status: string): void {
  if (!/Layer 1 Sandbox\s+Namespace/.test(status) || !/PID namespaces\s+Yes/.test(status) ||
      !/Network namespaces\s+Yes/.test(status) || !/Seccomp-BPF sandbox\s+Yes/.test(status)) {
    throw Error('sandbox-unverified');
  }
}
