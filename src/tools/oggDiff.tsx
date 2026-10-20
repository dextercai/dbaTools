import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import {
  buildOggConfig,
  type ConfigIssue,
  type OggKind,
  type OggMode,
} from '../../utils/oggConfig';

type OutputMode = 'diff' | 'full';

const exampleConfig = `EXTRACT EXT01
USERIDALIAS ogguser

SOURCECATALOG DTSBRIDGE
TABLE APP.T_ORDER;
TABLE APP.T_USER;

SOURCECATALOG TESTPDB
TABLE APP.T_ORDER;`;

export default function OggConfigPage() {
  const [mode, setMode] = useState<OggMode>('add');
  const [kind, setKind] = useState<OggKind>('TABLE');
  const [outputMode, setOutputMode] = useState<OutputMode>('diff');
  const [original, setOriginal] = useState(exampleConfig);
  const [tables, setTables] = useState(
    'DTSBRIDGE.APP.T_ORDER\nDTSBRIDGE.APP.T_PAYMENT',
  );
  const [inputCatalog, setInputCatalog] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const result = useMemo(
    () => buildOggConfig(original, tables, mode, kind, inputCatalog),
    [original, tables, mode, kind, inputCatalog],
  );
  const output = outputMode === 'diff' ? result.diff : result.full;
  const additionalWarnings = result.warnings.filter(
    (warning) => !result.issues.some((issue) => issue.message === warning),
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus('已复制到剪贴板');
    } catch {
      setCopyStatus('无法复制，请手动选择输出内容复制');
    }
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>OGG 配置表管理</Title>
        <Text c="dimmed" size="sm" mt={4}>
          批量增加表、注释移除表，识别 SOURCECATALOG 与三段式 PDB 表名。
        </Text>
      </div>

      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          <Group grow align="end">
            <Stack gap={6}>
              <Text fw={500} size="sm">操作模式</Text>
              <SegmentedControl
                fullWidth
                value={mode}
                onChange={(value) => {
                  setMode(value as OggMode);
                  setCopyStatus('');
                }}
                data={[
                  { value: 'add', label: '增加表' },
                  { value: 'remove', label: '去除表（注释）' },
                ]}
              />
            </Stack>
            <Select
              label="配置语句类型"
              value={kind}
              allowDeselect={false}
              onChange={(value) => setKind((value ?? 'TABLE') as OggKind)}
              data={[
                { value: 'TABLE', label: 'TABLE / Extract、Pump' },
                { value: 'MAP', label: 'MAP / Replicat' },
              ]}
            />
          </Group>

          <Textarea
            label="原始 OGG 配置"
            description="SOURCECATALOG 对其后面的 TABLE/MAP 生效，可在配置中多次出现"
            value={original}
            onChange={(e) => setOriginal(e.currentTarget.value)}
            autosize minRows={10} maxRows={24}
            styles={{ input: { fontFamily: 'monospace' } }}
          />

          <TextInput
            label="输入表默认 PDB（可选）"
            placeholder={result.lastCatalog ?? '例如 DTSBRIDGE'}
            description={
              result.lastCatalog
                ? `留空时，双段式输入默认归属最后一个 SOURCECATALOG：${result.lastCatalog}`
                : '原配置未发现 SOURCECATALOG；留空时两段式输入不会自动关联 PDB'
            }
            value={inputCatalog}
            onChange={(e) => setInputCatalog(e.currentTarget.value)}
          />

          <Textarea
            label={mode === 'add' ? '需要增加的表' : '需要注释的表'}
            description={
              kind === 'TABLE'
                ? '每行一个表，支持 APP.T_ORDER 或 DTSBRIDGE.APP.T_ORDER'
                : mode === 'add'
                  ? '每行一个映射；SOURCE => TARGET 指定目标，不写箭头时 TARGET 默认与 SOURCE 相同'
                  : '每行一个源表名；仅按 MAP 的源表匹配'
            }
            value={tables}
            onChange={(e) => setTables(e.currentTarget.value)}
            autosize minRows={5} maxRows={16}
            styles={{ input: { fontFamily: 'monospace' } }}
          />
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          <Group justify="space-between" wrap="wrap">
            <Group gap="xs">
              <Badge variant="light">输入 {result.total}</Badge>
              <Badge variant="light" color="green">变更 {result.changed}</Badge>
              <Badge variant="light" color="gray">跳过 {result.skipped}</Badge>
              {result.lastCatalog && (
                <Badge variant="outline" color="gray">
                  最后 PDB: {result.lastCatalog}
                </Badge>
              )}
            </Group>
            <SegmentedControl
              size="xs"
              value={outputMode}
              onChange={(v) => setOutputMode(v as OutputMode)}
              data={[
                { value: 'diff', label: '仅变更配置' },
                { value: 'full', label: '完整合并配置' },
              ]}
            />
          </Group>

          {result.issues.length > 0 && (
            <Alert
              color={result.issues.some((issue: ConfigIssue) => issue.severity === 'error') ? 'red' : 'yellow'}
              title={`原始配置检查：${result.issues.length} 项`}
            >
              <Stack gap={4}>
                {result.issues.map((issue: ConfigIssue, index: number) => (
                  <Text key={`${issue.line ?? 'global'}-${index}`} size="sm">
                    {issue.severity === 'error' ? '[错误]' : '[警告]'}{' '}
                    {issue.line ? `第 ${issue.line} 行：` : ''}{issue.message}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}

          {additionalWarnings.length > 0 && (
            <Alert color="yellow" title="需要检查">
              <Stack gap={4}>
                {additionalWarnings.map((warning) => (
                  <Text key={warning} size="sm">{warning}</Text>
                ))}
              </Stack>
            </Alert>
          )}

          <Textarea
            label="生成结果"
            value={output}
            readOnly
            autosize minRows={9} maxRows={26}
            placeholder="没有需要变更的配置"
            styles={{ input: { fontFamily: 'monospace' } }}
          />

          <Group justify="space-between">
            <Text c="dimmed" size="xs">
              不会执行数据库操作；生成后请审核并备份原 PRM。
            </Text>
            <Button variant="light" disabled={!output} onClick={handleCopy}>
              复制结果
            </Button>
          </Group>
          {copyStatus && <Text size="xs" c="dimmed">{copyStatus}</Text>}
        </Stack>
      </Paper>
    </Stack>
  );
}
