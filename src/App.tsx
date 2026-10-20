
import { useEffect } from 'react';
import {
  AppShell,
  Burger,
  Container,
  Group,
  NavLink as MantineNavLink,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  BrowserRouter,
  Navigate,
  NavLink as RouterNavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router';

import { toolItems } from "./toolItems"

// ==================== 工具页面 ====================

function HomePage() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>开发工具箱</Title>
        <Text c="dimmed" size="sm" mt={6}>
          一个页面，一个工具。所有工具均可独立扩展。
        </Text>
      </div>

      <Group grow align="stretch">
        {toolItems.map((item) => (
          <Paper
            key={item.path}
            withBorder
            radius="md"
            p="lg"
          >
            <Stack gap="sm">
              <Text fw={600}>{item.label}</Text>
              <Text c="dimmed" size="sm">
                {item.description}
              </Text>
              <MantineNavLink
                component={RouterNavLink}
                to={item.path}
                label="打开工具"
              />
            </Stack>
          </Paper>
        ))}
      </Group>
    </Stack>
  );
}


function NotFoundPage() {
  return (
    <Stack gap="sm">
      <Title order={2}>404</Title>
      <Text c="dimmed">找不到这个页面。</Text>
    </Stack>
  );
}



// ==================== 应用布局 ====================

function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const location = useLocation();

  // 路由变化后关闭移动端导航
  useEffect(() => {
    close();
  }, [location.pathname, close]);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      {/* 顶部 Header */}
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="切换导航栏"
            />

            <Text fw={700} size="lg">
              Dev Toolbox
            </Text>
          </Group>

          <Text size="sm" c="dimmed">
            Developer Tools
          </Text>
        </Group>
      </AppShell.Header>

      {/* 左侧导航 */}
      <AppShell.Navbar p="sm">
        <ScrollArea h="100%" type="auto">
          <Text
            size="xs"
            fw={600}
            c="dimmed"
            px="sm"
            py="xs"
          >
            工具导航
          </Text>

          <Stack gap={4}>
            <MantineNavLink
              component={RouterNavLink}
              to="/"
              label="首页"
              active={location.pathname === '/'}
              onClick={close}
            />

            {toolItems.map((item) => (
              <MantineNavLink
                key={item.path}
                component={RouterNavLink}
                to={item.path}
                label={item.label}
                description={item.description}
                active={location.pathname === item.path}
                variant="light"
                onClick={close}
              />
            ))}
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>

      {/* 路由页面内容 */}
      <AppShell.Main>
        <Container size="xl" py="md">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

// ==================== 应用入口与路由 ====================

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />

          {toolItems.map((item) => {
            const Page = item.component;

            return (
              <Route
                key={item.path}
                path={item.path}
                element={<Page />}
              />
            );
          })}

          <Route
            path="*"
            element={<NotFoundPage />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
