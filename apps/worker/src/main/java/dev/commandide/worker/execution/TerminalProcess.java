package dev.commandide.worker.execution;

import java.io.InputStream;
import java.io.OutputStream;

interface TerminalProcess {
    InputStream input();
    OutputStream output();
    void resize(int columns, int rows);
    int waitFor() throws InterruptedException;
    boolean isAlive();
    void terminateTree() throws InterruptedException;
}
