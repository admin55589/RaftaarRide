let automationEnabled = true;

export function isAutomationEnabled(): boolean {
  return automationEnabled;
}

export function setAutomationEnabled(val: boolean): void {
  automationEnabled = val;
}
