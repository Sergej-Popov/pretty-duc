import { useEffect, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { ConfigResponse, UserConfig } from '@pretty-duc/contracts';
import { fetchConfig, updateConfig, resetConfig } from './api';

type ConfigLimits = ConfigResponse['limits'];

const LIMIT_META: Array<{ key: keyof ConfigLimits; label: string; min: number; max: number }> = [
  { key: 'ducTimeoutMs', label: 'Duc timeout (ms)', min: 1000, max: 60000 },
  { key: 'recursiveBudgetMs', label: 'Recursive budget (ms)', min: 1000, max: 120000 },
  { key: 'defaultLevels', label: 'Default depth levels', min: 1, max: 6 },
  { key: 'maxChildrenLevels', label: 'Max children depth', min: 1, max: 10 },
  { key: 'maxTreeLevels', label: 'Max tree depth', min: 1, max: 5 },
  { key: 'maxChildrenPerDirectory', label: 'Max children per directory', min: 10, max: 100000 },
  { key: 'maxRecursiveNodes', label: 'Max recursive nodes', min: 100, max: 100000 },
  { key: 'maxTreeNodes', label: 'Max tree nodes', min: 100, max: 100000 },
  { key: 'maxChildrenResponseBytes', label: 'Max children response (bytes)', min: 65536, max: 104857600 },
  { key: 'maxTreeResponseBytes', label: 'Max tree response (bytes)', min: 65536, max: 104857600 },
  { key: 'recursiveConcurrency', label: 'Recursive concurrency', min: 1, max: 8 }
];

export function SettingsModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [draft, setDraft] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;

    setLoading(true);
    fetchConfig()
      .then((data) => {
        setConfig(data);
        setDraft(structuredClone(data));
      })
      .catch(() => {
        notifications.show({ message: 'Failed to load config', color: 'red' });
      })
      .finally(() => setLoading(false));
  }, [opened]);

  function setLimit(key: keyof ConfigLimits, value: number) {
    setDraft((prev) => prev ? { ...prev, limits: { ...prev.limits, [key]: value } } : prev);
  }

  function handleSave() {
    if (!draft) return;

    const payload: UserConfig = {
      limits: draft.limits,
      enableTreeApi: draft.enableTreeApi,
      defaultMinSize: draft.defaultMinSize
    };

    setSaving(true);
    updateConfig(payload)
      .then(() => {
        setConfig(draft);
        notifications.show({ message: 'Config saved', color: 'green' });
      })
      .catch((err) => {
        notifications.show({ message: err instanceof Error ? err.message : 'Save failed', color: 'red' });
      })
      .finally(() => setSaving(false));
  }

  function handleReset() {
    setSaving(true);
    resetConfig()
      .then(() => {
        return fetchConfig();
      })
      .then((data) => {
        setConfig(data);
        setDraft(structuredClone(data));
        notifications.show({ message: 'Config reset to defaults', color: 'green' });
      })
      .catch(() => {
        notifications.show({ message: 'Reset failed', color: 'red' });
      })
      .finally(() => setSaving(false));
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="lg">
      {loading || !draft ? (
        <Text c="dimmed">Loading...</Text>
      ) : (
        <Stack gap="md">
          <Switch
            checked={draft.enableTreeApi}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setDraft((prev) => prev ? { ...prev, enableTreeApi: checked } : prev);
            }}
            label="Enable tree API endpoint"
            description="Allows /api/tree (uses duc json, disabled by default for safety)"
          />

          <NumberInput
            label="Default min file size (bytes)"
            description="Null means no minimum filter"
            value={draft.defaultMinSize ?? undefined}
            onChange={(value) => setDraft((prev) => prev ? { ...prev, defaultMinSize: (typeof value === 'number' ? value : null) } : prev)}
            min={0}
            allowDecimal={false}
            placeholder="No minimum"
          />

          <Text size="xs" tt="uppercase" fw={700} c="dimmed" mt="md">Limits</Text>

          {LIMIT_META.map((meta) => (
            <NumberInput
              key={meta.key}
              label={meta.label}
              value={draft.limits[meta.key]}
              onChange={(value) => setLimit(meta.key, typeof value === 'number' ? value : meta.min)}
              min={meta.min}
              max={meta.max}
              allowDecimal={false}
              required
            />
          ))}

          <Text size="xs" c="dimmed">
            Config file: {config?.configFilePath ?? 'N/A'}
            {config?.hasSavedConfig ? ' (saved)' : ' (defaults)'}
          </Text>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" color="red" onClick={handleReset} loading={saving}>
              Reset to defaults
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
