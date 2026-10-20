import { Stack, Title, Text, Paper } from "@mantine/core";

export function JsonFormatterPage() {
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>JSON 格式化</Title>
        <Text c="dimmed" size="sm" mt={6}>
          JSON 格式化、压缩与语法校验。
        </Text>
      </div>

      <Paper withBorder radius="md" p="lg">
        <Text c="dimmed" size="sm">
          在这里实现 JSON 格式化功能。
        </Text>
      </Paper>
    </Stack>
  );
}

export function TextDiffPage() {
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>文本对比</Title>
        <Text c="dimmed" size="sm" mt={6}>
          文本差异比较，支持后续扩展自定义比较规则。
        </Text>
      </div>

      <Paper withBorder radius="md" p="lg">
        <Text c="dimmed" size="sm">
          在这里实现文本对比功能。
        </Text>
      </Paper>
    </Stack>
  );
}