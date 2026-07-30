package dev.commandide.worker.execution;

import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import com.pty4j.WinSize;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class Pty4jTerminalProcessFactory implements TerminalProcessFactory {
    @Override
    public TerminalProcess start(
            Path executable,
            List<String> arguments,
            Map<String, String> environment,
            Path workingDirectory,
            int columns,
            int rows) throws Exception {
        List<String> command = new ArrayList<>(arguments.size() + 1);
        command.add(executable.toAbsolutePath().normalize().toString());
        command.addAll(arguments);
        PtyProcess process = new PtyProcessBuilder(command.toArray(String[]::new))
                .setEnvironment(environment)
                .setDirectory(workingDirectory.toString())
                .setInitialColumns(columns)
                .setInitialRows(rows)
                .setRedirectErrorStream(true)
                .start();
        return new Adapter(process);
    }

    private record Adapter(PtyProcess process) implements TerminalProcess {
        @Override
        public InputStream input() {
            return process.getInputStream();
        }

        @Override
        public OutputStream output() {
            return process.getOutputStream();
        }

        @Override
        public void resize(int columns, int rows) {
            process.setWinSize(new WinSize(columns, rows));
        }

        @Override
        public int waitFor() throws InterruptedException {
            return process.waitFor();
        }

        @Override
        public boolean isAlive() {
            return process.isAlive();
        }

        @Override
        public void terminateTree() throws InterruptedException {
            process.descendants().forEach(ProcessHandle::destroy);
            process.destroy();
            if (!process.waitFor(300, TimeUnit.MILLISECONDS)) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                process.waitFor(700, TimeUnit.MILLISECONDS);
            }
        }
    }
}
