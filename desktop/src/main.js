const { invoke } = window.__TAURI__.core;
const { onOpenUrl, getCurrent } = window.__TAURI__.deepLink;

const navButtons = Array.from(document.querySelectorAll("[data-page-target]"));
const pages = Array.from(document.querySelectorAll(".app-page"));

const urlInput = document.getElementById("url-input");
const installButton = document.getElementById("install-button");
const checkUpdatesButton = document.getElementById("check-updates-button");
const reloadManifestButton = document.getElementById("reload-manifest-button");
const serviceStartButton = document.getElementById("service-start-button");
const serviceStopButton = document.getElementById("service-stop-button");
const serviceRefreshButton = document.getElementById("service-refresh-button");
const serversRefreshButton = document.getElementById("servers-refresh-button");
const updatesPlaceholderButton = document.getElementById("updates-placeholder-button");

const addonsList = document.getElementById("addons-list");
const addonsCount = document.getElementById("addons-count");
const sidebarServiceState = document.getElementById("sidebar-service-state");
const serviceStatusPill = document.getElementById("service-status-pill");
const serviceName = document.getElementById("service-name");
const serviceVersion = document.getElementById("service-version");
const serviceServerCount = document.getElementById("service-server-count");
const manifestReloadState = document.getElementById("manifest-reload-state");
const manifestReloadBanner = document.getElementById("manifest-reload-banner");
const manifestReloadMessage = document.getElementById("manifest-reload-message");
const localServerCount = document.getElementById("local-server-count");
const serversList = document.getElementById("servers-list");
const aboutSystemValue = document.getElementById("about-system-value");
const aboutRunningServersValue = document.getElementById("about-running-servers-value");
const aboutAppVersionValue = document.getElementById("about-app-version-value");
const aboutCompilerVersionValue = document.getElementById("about-compiler-version-value");
const aboutServiceVersionValue = document.getElementById("about-service-version-value");

const toastContainer = document.getElementById("toast-container");

// Templates
const addonCardTemplate = document.querySelector("template.addon-card-template");
const addonServerOverrideTemplate = document.querySelector("template.addon-server-override-template");
const addonRuntimeOverrideTemplate = document.querySelector("template.addon-runtime-override-template");
const settingsModalTemplate = document.querySelector("template.settings-modal-template");
const addonPreviewDependencyRowTemplate = document.querySelector("template.addon-preview-dependency-row-template");
const addonPreviewDependencyConflictTemplate = document.querySelector("template.addon-preview-dependency-conflict-template");
const addonPreviewTemplate = document.querySelector("template.addon-preview-template");
const runningServerRowTemplate = document.querySelector("template.running-server-row-template");

// Modals
const installModal = document.getElementById("install-modal");
const settingsModal = document.getElementById("settings-modal");
const uninstallModal = document.getElementById("uninstall-modal");

// State
let currentlyInstalledAddons = [];
let targetInstallUrl = "";
let targetUninstallSlug = "";
let targetSettingsAddon = null;
let currentInstallPreview = null;
let manifestNeedsReload = false;
let cachedServiceStatus = null;
let cachedRunningServers = [];
let activePage = "home";

document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    setupModalListeners();
    setupDeepLinks();
    bindDashboardActions();
    refreshDashboard("home");
    loadAddons();
    checkAddonUpdates(true);
});

function setupNavigation() {
    navButtons.forEach(button => {
        button.addEventListener("click", () => {
            setActivePage(button.dataset.pageTarget);
        });
    });

    setActivePage(activePage);
}

function setActivePage(pageName) {
    activePage = pageName;
    navButtons.forEach(button => {
        button.classList.toggle("active", button.dataset.pageTarget === pageName);
    });

    pages.forEach(page => {
        page.classList.toggle("active", page.id === `page-${pageName}`);
    });

    refreshDashboard(pageName);
}

function bindDashboardActions() {
    if (serviceStartButton) {
        serviceStartButton.addEventListener("click", startServiceFromUi);
    }

    if (serviceStopButton) {
        serviceStopButton.addEventListener("click", stopServiceFromUi);
    }

    if (serviceRefreshButton) {
        serviceRefreshButton.addEventListener("click", () => refreshDashboard("home"));
    }

    if (reloadManifestButton) {
        reloadManifestButton.addEventListener("click", reloadCompiledManifestFromUi);
    }

    if (serversRefreshButton) {
        serversRefreshButton.addEventListener("click", () => refreshDashboard("servers"));
    }

    if (updatesPlaceholderButton) {
        updatesPlaceholderButton.addEventListener("click", () => showToast("Update checker placeholder.", "info"));
    }
}

async function refreshDashboard(pageName) {
    if (pageName === "home") {
        await Promise.all([refreshServiceStatus(), refreshRunningServers(), refreshAboutInfo()]);
        return;
    }

    if (pageName === "servers") {
        await refreshRunningServers();
        return;
    }

    if (pageName === "about") {
        await Promise.all([refreshAboutInfo(), refreshRunningServers(), refreshServiceStatus()]);
    }
}

function setButtonState(button, enabled, label) {
    if (!button) return;
    button.disabled = !enabled;
    if (label) {
        const text = button.querySelector(".btn-text");
        if (text) {
            text.textContent = label;
        } else {
            button.textContent = label;
        }
    }
}

function updateManifestReloadState(isDirty, message = "Compila el manifest y recarga el service.") {
    manifestNeedsReload = isDirty;
    if (manifestReloadBanner) {
        manifestReloadBanner.classList.toggle("hidden", !isDirty);
    }
    if (manifestReloadMessage) {
        manifestReloadMessage.textContent = message;
    }
    if (manifestReloadState) {
        manifestReloadState.textContent = isDirty ? "Pending reload" : "Up to date";
    }
}

async function refreshServiceStatus() {
    try {
        const status = await invoke("get_service_status");
        cachedServiceStatus = status;

        const running = !!status.running;
        if (sidebarServiceState) {
            sidebarServiceState.textContent = running ? "Online" : "Offline";
        }
        if (serviceStatusPill) {
            serviceStatusPill.textContent = running ? "Online" : "Offline";
            serviceStatusPill.classList.toggle("is-online", running);
            serviceStatusPill.classList.toggle("is-offline", !running);
        }
        if (serviceName) {
            serviceName.textContent = status.service || "lynk-service";
        }
        if (serviceVersion) {
            serviceVersion.textContent = status.service_version || "-";
        }
        if (serviceServerCount) {
            serviceServerCount.textContent = String(status.active_servers ?? 0);
        }
        if (serviceStartButton) {
            serviceStartButton.disabled = running;
        }
        if (serviceStopButton) {
            serviceStopButton.disabled = !running;
        }
    } catch (error) {
        console.error("Error loading service status:", error);
        cachedServiceStatus = { running: false, service: "lynk-service", service_version: "-", active_servers: 0 };
        if (sidebarServiceState) {
            sidebarServiceState.textContent = "Offline";
        }
        if (serviceStatusPill) {
            serviceStatusPill.textContent = "Offline";
            serviceStatusPill.classList.remove("is-online");
            serviceStatusPill.classList.add("is-offline");
        }
        if (serviceVersion) {
            serviceVersion.textContent = "-";
        }
        if (serviceServerCount) {
            serviceServerCount.textContent = "0";
        }
        if (serviceStartButton) {
            serviceStartButton.disabled = false;
        }
        if (serviceStopButton) {
            serviceStopButton.disabled = true;
        }
    }
}

async function refreshRunningServers() {
    if (!serversList) return;

    try {
        const servers = await invoke("get_running_servers");
        cachedRunningServers = Array.isArray(servers) ? servers : [];

        if (localServerCount) {
            localServerCount.textContent = String(cachedRunningServers.length);
        }
        if (aboutRunningServersValue) {
            aboutRunningServersValue.textContent = String(cachedRunningServers.length);
        }

        if (cachedRunningServers.length === 0) {
            serversList.innerHTML = `<div class="empty-state"><div class="empty-icon">🛰️</div><h3>No active servers</h3><p>Start the service and open an addon server to see it here.</p></div>`;
            return;
        }

        serversList.innerHTML = cachedRunningServers.map((server) => {
            const metadata = server.metadata || {};
            const port = metadata.port ?? "-";
            const protocol = metadata.protocol ?? "unknown";
            const config = JSON.stringify(metadata, null, 2);

            return runningServerRowTemplate.innerHTML
                .replaceAll("$ID$", server.id)
                .replaceAll("$PROTOCOL$", protocol)
                .replaceAll("$PORT$", port)
                .replaceAll("$CONFIG$", config);
        }).join("");
    } catch (error) {
        console.error("Error loading running servers:", error);
        cachedRunningServers = [];
        if (localServerCount) {
            localServerCount.textContent = "0";
        }
        if (aboutRunningServersValue) {
            aboutRunningServersValue.textContent = "0";
        }
        serversList.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Unable to load servers</h3><p>${error}</p></div>`;
    }
}

async function refreshAboutInfo() {
    try {
        const systemValue = await invoke("get_system_info");
        if (aboutSystemValue) {
            aboutSystemValue.textContent = systemValue;
        }
    } catch (error) {
        console.error("Failed to read system info:", error);
        if (aboutSystemValue) {
            aboutSystemValue.textContent = "Unknown";
        }
    }
    try {
        const appVersion = await invoke("get_app_version");
        if (aboutAppVersionValue) {
            aboutAppVersionValue.textContent = appVersion || "-";
        }
    } catch (error) {
        console.error("Failed to read app version:", error);
        if (aboutAppVersionValue) {
            aboutAppVersionValue.textContent = "-";
        }
    }

    if (cachedServiceStatus) {
        if (aboutCompilerVersionValue) {
            aboutCompilerVersionValue.textContent = cachedServiceStatus.compiler_version || "-";
        }
        if (aboutServiceVersionValue) {
            aboutServiceVersionValue.textContent = cachedServiceStatus.service_version || "-";
        }
        if (aboutRunningServersValue) {
            aboutRunningServersValue.textContent = String(cachedServiceStatus.active_servers ?? cachedRunningServers.length);
        }
    }
}

async function startServiceFromUi() {
    if (!serviceStartButton) return;
    setButtonLoading(serviceStartButton, true);
    try {
        const status = await invoke("start_service");
        cachedServiceStatus = status;
        showToast("Service started successfully.", "success");
        await refreshDashboard("home");
    } catch (error) {
        console.error("Service start error:", error);
        showToast(`Failed to start service: ${error}`, "error");
    } finally {
        setButtonLoading(serviceStartButton, false);
    }
}

async function stopServiceFromUi() {
    if (!serviceStopButton) return;
    setButtonLoading(serviceStopButton, true);
    try {
        await invoke("shutdown_service");
        showToast("Service shutdown requested.", "warning");
        cachedServiceStatus = { running: false };
        await refreshDashboard("home");
    } catch (error) {
        console.error("Service shutdown error:", error);
        showToast(`Failed to stop service: ${error}`, "error");
    } finally {
        setButtonLoading(serviceStopButton, false);
    }
}

async function reloadCompiledManifestFromUi() {
    if (!reloadManifestButton) return;
    setButtonLoading(reloadManifestButton, true);
    try {
        await invoke("reload_compiled_manifest");
        updateManifestReloadState(false);
        showToast("Compiled manifest reloaded in service.", "success");
        await refreshDashboard("home");
        await refreshDashboard("servers");
    } catch (error) {
        console.error("Manifest reload error:", error);
        showToast(`Failed to reload compiled manifest: ${error}`, "error");
    } finally {
        setButtonLoading(reloadManifestButton, false);
    }
}

// Toast Notifications
function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    toast.innerHTML = `<span class="toast-close-icon">✕</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    toast.querySelector(".toast-close-icon").addEventListener("click", () => {
        toast.classList.add("fade-out");
        setTimeout(() => {
            toast.remove();
        }, 300);
    });
    
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4500);
}

// Button loading state
function setButtonLoading(button, isLoading) {
    if (!button) return;
    const spinner = button.querySelector(".btn-spinner");
    const text = button.querySelector(".btn-text");
    if (isLoading) {
        button.disabled = true;
        if (spinner) spinner.classList.remove("hidden");
    } else {
        button.disabled = false;
        if (spinner) spinner.classList.add("hidden");
    }
}

// Modal handling utilities
function openModal(modal) {
    if (!modal) return;
    modal.classList.remove("hidden");
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.add("hidden");
}

function setupModalListeners() {
    // Install Modal
    const installModal = document.getElementById("install-modal");
    installModal.addEventListener("click", (e) => {if (e.target === installModal) closeModal(installModal)});
    document.getElementById("install-modal-close").addEventListener("click", () => closeModal(installModal));
    document.getElementById("install-modal-cancel").addEventListener("click", () => closeModal(installModal));
    document.getElementById("install-modal-confirm").addEventListener("click", confirmInstall);
    document.getElementById("install-modal-replace").addEventListener("click", replaceInstall);

    // Settings Modal
    const settingsModal = document.getElementById("settings-modal");
    settingsModal.addEventListener("click", (e) => {if (e.target === settingsModal) closeModal(settingsModal)});
    document.getElementById("settings-modal-close").addEventListener("click", () => closeModal(settingsModal));
    document.getElementById("settings-modal-cancel").addEventListener("click", () => closeModal(settingsModal));
    document.getElementById("settings-modal-save").addEventListener("click", saveSettings);

    // Uninstall Modal
    const uninstallModal = document.getElementById("uninstall-modal");
    uninstallModal.addEventListener("click", (e) => {if (e.target === uninstallModal) closeModal(uninstallModal)});
    document.getElementById("uninstall-modal-close").addEventListener("click", () => closeModal(uninstallModal));
    document.getElementById("uninstall-modal-cancel").addEventListener("click", () => closeModal(uninstallModal));
    document.getElementById("uninstall-modal-confirm").addEventListener("click", confirmUninstall);
}

// Deep Links handling
async function setupDeepLinks() {
    try {
        const initialUrls = await getCurrent();
        if (initialUrls && initialUrls.length > 0) {
            handleIncomingDeepLink(initialUrls[0]);
        }
        
        await onOpenUrl((urls) => {
            if (urls && urls.length > 0) {
                const { getCurrentWindow } = window.__TAURI__.window;
                getCurrentWindow().show().then(() => getCurrentWindow().focus());
                handleIncomingDeepLink(urls[0]);
            }
        });
    } catch (err) {
        console.error("Failed to setup deep links listener:", err);
    }
}

function handleIncomingDeepLink(link) {
    console.log("Processing deep link:", link);
    try {
        const urlObj = new URL(link);
        let manifestUrl = urlObj.searchParams.get("url");
        if (!manifestUrl && link.includes("?url=")) {
            manifestUrl = link.split("?url=")[1];
        }
        if (manifestUrl) {
            manifestUrl = decodeURIComponent(manifestUrl);
            urlInput.value = manifestUrl;
            setActivePage("addons");
            triggerInstallPreview(manifestUrl);
        } else {
            showToast("Deep link received, but no valid URL parameter found", "warning");
        }
    } catch (e) {
        // Fallback simple parsing if URL parser fails on custom schemes
        if (link.includes("install?url=")) {
            let manifestUrl = link.split("install?url=")[1];
            if (manifestUrl) {
                manifestUrl = decodeURIComponent(manifestUrl);
                urlInput.value = manifestUrl;
                setActivePage("addons");
                triggerInstallPreview(manifestUrl);
                return;
            }
        }
        console.error("Error parsing deep link:", e);
    }
}

// Load Installed Addons list
async function loadAddons() {
    addonsList.innerHTML = `<div class="loading-state" id="loading-state"><div class="spinner"></div><p>Loading installed addons...</p></div>`;
    
    try {
        const addons = await invoke("get_installed_addons");
        addons.sort((a, b) => a.installed_id.localeCompare(b.installed_id));
        let enabledStates = {};

        try {
            enabledStates = await invoke("get_addon_enablements");
        } catch (enablementError) {
            console.error("Error loading addon enablements:", enablementError);
        }

        currentlyInstalledAddons = addons;
        addonsCount.textContent = `${addons.length} Addon${addons.length === 1 ? '' : 's'}`;
        
        if (addons.length === 0) {
            addonsList.innerHTML = `<div class="empty-state" id="empty-state"><div class="empty-icon">📦</div><h3>No addons installed</h3><p>You haven't installed any addons yet. Use the installer above to add them.</p></div>`;
            return;
        }
        
        addonsList.innerHTML = "";
        
        addons.forEach(addon => {
            const card = createAddonCard(addon, enabledStates[addon.installed_id]);
            addonsList.appendChild(card);
        });

        await refreshDashboard("about");
    } catch (error) {
        console.error("Error loading addons:", error);
        showToast(`Failed to load addons: ${error}`, "error");
        addonsList.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Failed to load addons</h3><p>${error}</p></div>`;
    }
}

// Trigger installation preview
installButton.addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (!url) {
        showToast("Please enter a valid manifest URL", "error");
        return;
    }
    triggerInstallPreview(url);
});

async function triggerInstallPreview(url) {
    setButtonLoading(installButton, true);
    try {
        const preview = await invoke("preview_install_addon", { manifestUrl: url });
        currentInstallPreview = preview;
        targetInstallUrl = url;

        const body = document.getElementById("install-modal-body");
        const manifest = preview.manifest;
        const description = manifest.description || "No description provided.";
        const hasConflicts = Array.isArray(preview.conflicts) && preview.conflicts.length > 0;
        const unresolvedRequiredDeps = (preview.dependencies || []).filter(dep => !dep.optional && dep.status !== "satisfied" && !dep.resolved_origin_url);

        const runtimesHtml = (manifest.runtimes && manifest.runtimes.length > 0)
            ? manifest.runtimes.map(rt => `<span class="info-tag">${rt.id}</span>`).join("")
            : "<span class='text-muted'>None</span>";

        const serversHtml = (manifest.servers && manifest.servers.length > 0)
            ? manifest.servers.map(srv => `<span class="info-tag info-tag-server">${srv.id} (${srv.runtime_engine || 'default'})</span>`).join("")
            : "<span class='text-muted'>None</span>";

        const dependencyRows = (preview.dependencies || []).map(dep => {
            const versionLabel = dep.version ? `Requires >= ${dep.version}` : "Any version";
            const originLabel = dep.resolved_origin_url || (dep.origins && dep.origins.length > 0 ? dep.origins.join(", ") : "No origin available");
            const checkboxDisabled = dep.status === "satisfied" || (!dep.resolved_origin_url && !dep.optional);
            const checkboxChecked = dep.status !== "satisfied" && !!dep.resolved_origin_url && !dep.optional;
            return addonPreviewDependencyRowTemplate.innerHTML
                .replaceAll("$DEPENDENCY_ID$", dep.id)
                .replaceAll("$DEPENDENCY_ORIGIN$", originLabel)
                .replaceAll("$DEPENDENCY_VERSION$", versionLabel)
                .replaceAll("$DISABLED$", checkboxDisabled ? "disabled" : "")
                .replaceAll("$CHECKED$", checkboxChecked ? "checked" : "")
                .replaceAll("$OPTIONAL_TEXT$", dep.optional ? "Optional" : "Required")
                .replaceAll("$DEPENDENCY_OPTIONAL_CLASS$", dep.optional ? "dependency-optional" : "")
                .replaceAll("$DEPENDENCY_SATISFIED_CLASS$", dep.status === "satisfied" ? "dependency-satisfied" : "")
                .replaceAll("$INSTALLED_VERSION$", dep.installed_version || "");
        }).join("") || "<span class='text-muted'>None</span>";

        const conflictRows = (preview.conflicts || []).map(conflict => addonPreviewDependencyConflictTemplate.innerHTML
            .replaceAll("$CONFLICT_NAME$", conflict.name)
            .replaceAll("$CONFLICT_INSTALLED_ID$", conflict.installed_id)
            .replaceAll("$CONFLICT_VERSION$", conflict.version)
        ).join("") || "<span class='text-muted'>None</span>";

        body.innerHTML = addonPreviewTemplate.innerHTML
            .replaceAll("$NAME$", manifest.name)
            .replaceAll("$VERSION$", manifest.version)
            .replaceAll("$ADDON_ID$", manifest.id)
            .replaceAll("$DESCRIPTION$", description)
            .replaceAll("$RUNTIMES$", runtimesHtml)
            .replaceAll("$SERVERS$", serversHtml)
            .replaceAll("$DEPENDENCIES$", dependencyRows)
            .replaceAll("$CONFLICTS$", conflictRows)
            .replaceAll("$UNRESOLVED_REQUIRED_DEPS_WARNING$", unresolvedRequiredDeps.length > 0 ? `<div class="warning-box">Some required dependencies do not have a usable origin yet. You can still continue, but the addon may fail to compile until they are available.</div>` : "");
        const confirmBtn = document.getElementById("install-modal-confirm");
        const replaceBtn = document.getElementById("install-modal-replace");
        confirmBtn.disabled = false;
        replaceBtn.disabled = !hasConflicts;

        openModal(installModal);
    } catch (error) {
        console.error("Preview error:", error);
        showToast(`Failed to retrieve manifest information: ${error}`, "error");
    } finally {
        setButtonLoading(installButton, false);
    }
}

// Confirm install from modal
async function confirmInstall() {
    const confirmBtn = document.getElementById("install-modal-confirm");
    const body = document.getElementById("install-modal-body");
    const dependencyCheckboxes = Array.from(body.querySelectorAll(".dependency-install-checkbox"));
    setButtonLoading(confirmBtn, true);
    try {
        if (currentInstallPreview && Array.isArray(currentInstallPreview.dependencies)) {
            for (const checkbox of dependencyCheckboxes) {
                if (!checkbox.checked || checkbox.disabled) continue;
                const dependencyId = checkbox.dataset.dependencyId;
                const dependency = currentInstallPreview.dependencies.find(item => item.id === dependencyId);
                const dependencyOrigin = checkbox.dataset.dependencyOrigin;
                if (dependency && dependencyOrigin) {
                    const dependencyResult = await invoke("install_addon", {
                        manifestUrl: dependencyOrigin,
                        replaceExisting: !!dependency.installed_version
                    });
                    showToast(`Installed dependency ${dependencyResult.name}.`, "info");
                }
            }
        }

        const result = await invoke("install_addon", {
            manifestUrl: targetInstallUrl,
            replaceExisting: false,
        });
        showToast(`Successfully installed ${result.name}!`);
        closeModal(installModal);
        urlInput.value = "";
        currentInstallPreview = null;
        await compileManifest();
        await loadAddons();
        await refreshDashboard("servers");
    } catch (error) {
        console.error("Install error:", error);
        showToast(`Failed to install addon: ${error}`, "error");
    } finally {
        setButtonLoading(confirmBtn, false);
    }
}

async function replaceInstall() {
    const replaceBtn = document.getElementById("install-modal-replace");
    const body = document.getElementById("install-modal-body");
    const dependencyCheckboxes = Array.from(body.querySelectorAll(".dependency-install-checkbox"));
    setButtonLoading(replaceBtn, true);
    try {
        if (currentInstallPreview && Array.isArray(currentInstallPreview.dependencies)) {
            for (const checkbox of dependencyCheckboxes) {
                if (!checkbox.checked || checkbox.disabled) continue;
                const dependencyId = checkbox.dataset.dependencyId;
                const dependency = currentInstallPreview.dependencies.find(item => item.id === dependencyId);
                const dependencyOrigin = checkbox.dataset.dependencyOrigin;
                if (dependency && dependencyOrigin) {
                    const dependencyResult = await invoke("install_addon", {
                        manifestUrl: dependencyOrigin,
                        replaceExisting: !!dependency.installed_version
                    });
                    showToast(`Installed dependency ${dependencyResult.name}.`, "info");
                }
            }
        }

        const result = await invoke("install_addon", {
            manifestUrl: targetInstallUrl,
            replaceExisting: true,
        });
        showToast(`Successfully installed ${result.name}!`);
        closeModal(installModal);
        urlInput.value = "";
        currentInstallPreview = null;
        await compileManifest();
        await loadAddons();
        await refreshDashboard("servers");
    } catch (error) {
        console.error("Install error:", error);
        showToast(`Failed to install addon: ${error}`, "error");
    } finally {
        setButtonLoading(replaceBtn, false);
    }
}

// Create addon card
function createAddonCard(addon, enabledState) {
    const card = document.createElement("article");
    card.className = "card addon-card";
    card.id = `addon-${addon.installed_id}`;
    
    const description = addon.description || "No description provided.";
    
    card.innerHTML = addonCardTemplate.innerHTML
        .replaceAll("$ADDON_NAME$", addon.name)
        .replaceAll("$ADDON_VERSION$", addon.version)
        .replaceAll("$ADDON_SLUG$", addon.installed_id)
        .replaceAll("$ADDON_DESCRIPTION$", description)
        .replaceAll("$ADDON_INSTALLED_ID$", addon.installed_id)
        .replaceAll("template-id=", "id=");

    const enabledBadge = card.querySelector(`#badge-enabled-${addon.installed_id}`);
    if (enabledBadge) {
        if (enabledState) {
            const hasSpecificSelection = Array.isArray(enabledState.runtimes) || Array.isArray(enabledState.servers);
            enabledBadge.textContent = hasSpecificSelection ? "Enabled custom" : "Enabled";
            enabledBadge.classList.remove("hidden");
        } else {
            enabledBadge.textContent = "Not enabled";
            enabledBadge.classList.remove("hidden");
            enabledBadge.classList.add("badge-muted");
        }
    }
    
    // Wire configure button
    const configBtn = card.querySelector(`#btn-toggle-settings-${addon.installed_id}`);
    configBtn.addEventListener("click", () => openSettingsModal(addon));

    // Wire update button
    const updateBtn = card.querySelector(`#btn-update-${addon.installed_id}`);
    updateBtn.addEventListener("click", async () => {
        setButtonLoading(updateBtn, true);
        try {
            const updated = await invoke("update_addon", { addonSlug: addon.installed_id });
            showToast(`Successfully updated ${addon.name} to v${updated.version}!`);
            await compileManifest();
            await loadAddons();
            await refreshDashboard("servers");
        } catch (error) {
            console.error("Update error:", error);
            showToast(`Update failed: ${error}`, "error");
        } finally {
            setButtonLoading(updateBtn, false);
        }
    });
    
    // Wire uninstall button
    const uninstallBtn = card.querySelector(`#btn-uninstall-${addon.installed_id}`);
    uninstallBtn.addEventListener("click", () => triggerUninstallConfirm(addon));

    return card;
}

// Open settings modal
async function openSettingsModal(addon) {
    targetSettingsAddon = addon;
    const body = document.getElementById("settings-modal-body");
    
    // Load skeleton
    body.innerHTML = settingsModalTemplate.innerHTML
        .replaceAll("$ADDON_INSTALLED_ID$", addon.installed_id)
        .replaceAll("template-id=", "id=");

    const runtimesContainer = body.querySelector(`#runtimes-container-${addon.installed_id}`);
    const serversContainer = body.querySelector(`#servers-container-${addon.installed_id}`);
    const enabledSwitch = body.querySelector(`#enabled-switch-${addon.installed_id}`);
    const skipDepsCheckbox = body.querySelector(`#skip-deps-${addon.installed_id}`);
    const presetSelect = body.querySelector(`#preset-select-${addon.installed_id}`);
    const presetDesc = body.querySelector(`#preset-desc-${addon.installed_id}`);

    // Populate Runtimes
    runtimesContainer.innerHTML = "";
    if (addon.runtimes && addon.runtimes.length > 0) {
        addon.runtimes.forEach(rt => {
            const row = document.createElement("div");
            row.className = "override-row";
            row.innerHTML = addonRuntimeOverrideTemplate.innerHTML
                .replaceAll("$ADDON_INSTALLED_ID$", addon.installed_id)
                .replaceAll("$IDX$", rt.id)
                .replaceAll("$ID$", rt.id)
                .replaceAll("template-id=", "id=");
            runtimesContainer.appendChild(row);
        });
    } else {
        runtimesContainer.innerHTML = `<span class="text-muted" style="font-size: 13px;">No runtimes defined.</span>`;
    }

    // Populate Servers
    serversContainer.innerHTML = "";
    if (addon.servers && addon.servers.length > 0) {
        addon.servers.forEach((srv, idx) => {
            const group = document.createElement("div");
            group.className = "override-row-4";
            group.innerHTML = addonServerOverrideTemplate.innerHTML
                .replaceAll("$ADDON_INSTALLED_ID$", addon.installed_id)
                .replaceAll("$IDX$", idx)
                .replaceAll("$ID$", srv.id)
                .replaceAll("$RUNTIME_ENGINE$", srv.runtime_engine || 'default')
                .replaceAll("$ARGS$", srv.args ? srv.args : 'none')
                .replaceAll("template-id=", "id=");
            serversContainer.appendChild(group);
        });
    } else {
        serversContainer.innerHTML = `<span class="text-muted" style="font-size: 13px;">No servers defined.</span>`;
    }

    let activeEnabled = null;
    try {
        activeEnabled = await invoke("get_addon_enabled", { addonSlug: addon.installed_id });
    } catch (err) {
        console.error("Error reading enabled state:", err);
    }

    if (enabledSwitch) {
        enabledSwitch.checked = !!activeEnabled;
        enabledSwitch.addEventListener("change", () => {
            const shouldEnableAll = enabledSwitch.checked;
            body.querySelectorAll(".runtime-enabled-checkbox").forEach(input => {
                input.checked = shouldEnableAll;
            });
            body.querySelectorAll(".server-enabled-checkbox").forEach(input => {
                input.checked = shouldEnableAll;
            });
        });
    }

    if (activeEnabled) {
        const hasExplicitRuntimeSelection = Array.isArray(activeEnabled.runtimes);
        const hasExplicitServerSelection = Array.isArray(activeEnabled.servers);
        const enableAllComponents = !hasExplicitRuntimeSelection && !hasExplicitServerSelection;

        if (enableAllComponents && addon.runtimes) {
            addon.runtimes.forEach(rt => {
                const input = body.querySelector(`#rt-enabled-${addon.installed_id}-${rt.id}`);
                if (input) input.checked = true;
            });
        } else if (hasExplicitRuntimeSelection) {
            activeEnabled.runtimes.forEach(runtimeId => {
                const input = body.querySelector(`#rt-enabled-${addon.installed_id}-${runtimeId}`);
                if (input) input.checked = true;
            });
        }

        if (enableAllComponents && addon.servers) {
            addon.servers.forEach((srv, idx) => {
                const input = body.querySelector(`#srv-enabled-${addon.installed_id}-${idx}`);
                if (input) input.checked = true;
            });
        } else if (hasExplicitServerSelection) {
            activeEnabled.servers.forEach(serverId => {
                const serverInput = body.querySelectorAll(`.server-enabled-checkbox`);
                serverInput.forEach(input => {
                    if (input.dataset.serverId === serverId) {
                        input.checked = true;
                    }
                });
            });
        }
    }

    // Populate Presets Select
    if (addon.presets && Object.keys(addon.presets).length > 0) {
        Object.entries(addon.presets).forEach(([presetKey, preset]) => {
            const opt = document.createElement("option");
            opt.value = presetKey;
            opt.textContent = preset.name || presetKey;
            presetSelect.appendChild(opt);
        });
        
        presetSelect.addEventListener("change", () => {
            const val = presetSelect.value;
            if (!val) {
                presetDesc.classList.add("hidden");
                return;
            }
            
            const selectedPreset = addon.presets[val];
            if (selectedPreset) {
                if (selectedPreset.description) {
                    presetDesc.textContent = selectedPreset.description;
                    presetDesc.classList.remove("hidden");
                } else {
                    presetDesc.classList.add("hidden");
                }
                
                if (selectedPreset.override) {
                    applyPresetOverrides(addon.installed_id, selectedPreset.override, body);
                    showToast(`Applied preset "${selectedPreset.name || val}" settings to fields. Remember to save!`, "info");
                }
            }
        });
    } else {
        presetSelect.innerHTML = `<option value="">No presets available</option>`;
        presetSelect.disabled = true;
    }

    // Load active overrides from backend
    try {
        const activeOverride = await invoke("get_addon_override", { addonSlug: addon.installed_id });
        if (activeOverride) {
            if (activeOverride.skip_dependencies !== undefined && activeOverride.skip_dependencies !== null) {
                skipDepsCheckbox.checked = activeOverride.skip_dependencies;
            } else {
                skipDepsCheckbox.checked = false;
            }

            if (activeOverride.runtimes) {
                Object.entries(activeOverride.runtimes).forEach(([rtId, rtDef]) => {
                    const input = body.querySelector(`#rt-override-${addon.installed_id}-${rtId}`);
                    if (input && rtDef.id) {
                        input.value = rtDef.id;
                    }
                });
            }

            if (activeOverride.servers && addon.servers) {
                addon.servers.forEach((srv, idx) => {
                    const overrideSrv = activeOverride.servers[srv.id];
                    if (overrideSrv) {
                        const protoInput = body.querySelector(`#srv-proto-${addon.installed_id}-${idx}`);
                        const engineInput = body.querySelector(`#srv-engine-${addon.installed_id}-${idx}`);
                        const argsInput = body.querySelector(`#srv-args-${addon.installed_id}-${idx}`);

                        if (protoInput && overrideSrv.id) protoInput.value = overrideSrv.id;
                        if (engineInput && overrideSrv.runtime_engine) engineInput.value = overrideSrv.runtime_engine;
                        if (argsInput && overrideSrv.args) argsInput.value = overrideSrv.args;
                    }
                });
            }
        }
    } catch (err) {
        console.error("Error reading overrides:", err);
        showToast("Error loading overrides configuration", "error");
    }

    openModal(settingsModal);
}

// Preset application utility
function applyPresetOverrides(installedId, overrideSetting, body) {
    const skipDepsCheckbox = body.querySelector(`#skip-deps-${installedId}`);
    if (skipDepsCheckbox) {
        skipDepsCheckbox.checked = !!overrideSetting.skip_dependencies;
    }

    const runtimeInputs = body.querySelectorAll(`.runtime-override-input`);
    runtimeInputs.forEach(input => {
        const rtId = input.dataset.runtimeId;
        if (overrideSetting.runtimes && overrideSetting.runtimes[rtId]) {
            input.value = overrideSetting.runtimes[rtId].id || "";
        } else {
            input.value = "";
        }
    });

    const serverProtoInputs = body.querySelectorAll(`[id^="srv-proto-${installedId}-"]`);
    serverProtoInputs.forEach(protoInput => {
        const idx = protoInput.dataset.serverIdx;
        const protoPlaceholder = protoInput.placeholder;

        const presetOverrideSrv = overrideSetting.servers ? overrideSetting.servers[protoPlaceholder] : null;
        
        const engineInput = body.querySelector(`#srv-engine-${installedId}-${idx}`);
        const argsInput = body.querySelector(`#srv-args-${installedId}-${idx}`);

        if (presetOverrideSrv) {
            protoInput.value = presetOverrideSrv.id || "";
            if (engineInput) engineInput.value = presetOverrideSrv.runtime_engine || "";
            if (argsInput) argsInput.value = presetOverrideSrv.args ? presetOverrideSrv.args : "";
        } else {
            protoInput.value = "";
            if (engineInput) engineInput.value = "";
            if (argsInput) argsInput.value = "";
        }
    });
}

// Save settings from modal overrides form
async function saveSettings() {
    const addon = targetSettingsAddon;
    if (!addon) return;
    
    const body = document.getElementById("settings-modal-body");
    const enabledSwitch = body.querySelector(`#enabled-switch-${addon.installed_id}`);
    const skipDepsCheckbox = body.querySelector(`#skip-deps-${addon.installed_id}`);
    const runtimeEnabledInputs = body.querySelectorAll(".runtime-enabled-checkbox");
    const serverEnabledInputs = body.querySelectorAll(".server-enabled-checkbox");
    
    const overrideDef = {
        runtimes: {},
        servers: {},
        skip_dependencies: skipDepsCheckbox.checked
    };

    const runtimeInputs = body.querySelectorAll(".runtime-override-input");
    runtimeInputs.forEach(input => {
        const rtId = input.dataset.runtimeId;
        const val = input.value.trim();
        if (val) {
            overrideDef.runtimes[rtId] = { id: val };
        }
    });
    try {
        if (enabledSwitch && enabledSwitch.checked) {
            const enabledRuntimeIds = [];
            runtimeEnabledInputs.forEach(input => {
                if (input.checked) {
                    enabledRuntimeIds.push(input.dataset.runtimeId);
                }
            });

            const enabledServerIds = [];
            serverEnabledInputs.forEach(input => {
                if (input.checked) {
                    enabledServerIds.push(input.dataset.serverId);
                }
            });

            const allRuntimeChecked = runtimeEnabledInputs.length === 0 || enabledRuntimeIds.length === runtimeEnabledInputs.length;
            const allServerChecked = serverEnabledInputs.length === 0 || enabledServerIds.length === serverEnabledInputs.length;

            if (allRuntimeChecked && allServerChecked) {
                await invoke("save_addon_enabled", {
                    addonSlug: addon.installed_id,
                    enabledDef: {}
                });
            } else {
                const payload = {};
                if (enabledRuntimeIds.length > 0) {
                    payload.runtimes = enabledRuntimeIds;
                }
                if (enabledServerIds.length > 0) {
                    payload.servers = enabledServerIds;
                }

                await invoke("save_addon_enabled", {
                    addonSlug: addon.installed_id,
                    enabledDef: payload
                });
            }
        } else {
            await invoke("delete_addon_enabled", {
                addonSlug: addon.installed_id
            });
        }

        if (addon.servers) {
            addon.servers.forEach((srv, idx) => {
                const protoInput = body.querySelector(`#srv-proto-${addon.installed_id}-${idx}`);
                const engineInput = body.querySelector(`#srv-engine-${addon.installed_id}-${idx}`);
                const argsInput = body.querySelector(`#srv-args-${addon.installed_id}-${idx}`);

                const protoVal = protoInput ? protoInput.value.trim() : "";
                const engineVal = engineInput ? engineInput.value.trim() : "";
                const argsVal = argsInput ? argsInput.value.trim() : "";

                if (protoVal || engineVal || argsVal) {
                    const srvOverride = {};
                    if (protoVal) srvOverride.id = protoVal;
                    if (engineVal) srvOverride.runtime_engine = engineVal;
                    if (argsVal) srvOverride.args = argsVal;
                    overrideDef.servers[srv.id] = srvOverride;
                }
            });
        }

        await invoke("save_addon_override", { 
            addonSlug: addon.installed_id, 
            overrideDef 
        });
        showToast("Addon configuration overrides saved successfully!");
        closeModal(settingsModal);
        
        await compileManifest();
        await loadAddons();
        await refreshDashboard("servers");
    } catch (err) {
        console.error("Error saving overrides:", err);
        showToast(`Failed to save overrides: ${err}`, "error");
    }
}

// Background compiler manifest trigger
async function compileManifest() {
    try {
        await invoke("compile_manifest");
        updateManifestReloadState(true, "Changes are compiled. Click reload to refresh the running service.");
        showToast("Changes compiled! Click reload to apply them.", "success");
    } catch (err) {
        console.error("Compiler background error:", err);
        showToast(`Failed to compile manifest: ${err}`, "error");
    }
}

// Uninstall confirmation
function triggerUninstallConfirm(addon) {
    targetUninstallSlug = addon.installed_id;
    document.getElementById("uninstall-addon-name").textContent = addon.name;
    openModal(uninstallModal);
}

async function confirmUninstall() {
    const confirmBtn = document.getElementById("uninstall-modal-confirm");
    setButtonLoading(confirmBtn, true);
    try {
        await invoke("uninstall_addon", { addonSlug: targetUninstallSlug });
        showToast(`Successfully uninstalled addon.`);
        closeModal(uninstallModal);
        await compileManifest();
        await loadAddons();
        await refreshDashboard("servers");
    } catch (error) {
        console.error("Uninstall error:", error);
        showToast(`Uninstall failed: ${error}`, "error");
    } finally {
        setButtonLoading(confirmBtn, false);
    }
}

// Check updates for all addons

const checkAddonUpdates = async (isBackground = false) => {
    if (!isBackground) setButtonLoading(checkUpdatesButton, true);
    let updatesFoundCount = 0;
    
    try {
        if (currentlyInstalledAddons.length === 0) {
            if (!isBackground) showToast("No addons installed to check.", "info");
            return;
        }
        
        for (const addon of currentlyInstalledAddons) {
            const card = document.getElementById(`addon-${addon.installed_id}`);
            if (!card) continue;
            
            const badgeUpdate = card.querySelector(`#badge-update-${addon.installed_id}`);
            const updateBtn = card.querySelector(`#btn-update-${addon.installed_id}`);
            
            try {
                // Call check addon update command
                const remoteVersion = await invoke("check_addon_update", { addonSlug: addon.installed_id });
                if (remoteVersion) {
                    updatesFoundCount++;
                    if (badgeUpdate) {
                        badgeUpdate.textContent = `Update Available (v${remoteVersion})`;
                        badgeUpdate.classList.remove("hidden");
                    }
                    if (updateBtn) {
                        updateBtn.classList.remove("hidden");
                    }
                } else {
                    if (badgeUpdate) badgeUpdate.classList.add("hidden");
                    if (updateBtn) updateBtn.classList.add("hidden");
                }
            } catch (err) {
                console.error(`Error checking update for ${addon.name}:`, err);
            }
        }
        
        if (updatesFoundCount > 0) {
            if (!isBackground) showToast(`Updates check complete. Found ${updatesFoundCount} update(s)!`, "warning");
            else showToast(`Found ${updatesFoundCount} update(s)!`, "warning");
        } else {
            if (!isBackground) showToast("Your addons are all up to date.", "success");
        }
    } catch (error) {
        console.error("Check updates bulk error:", error);
        if (!isBackground) showToast(`Updates check failed: ${error}`, "error");
    } finally {
        if (!isBackground) setButtonLoading(checkUpdatesButton, false);
    }
};
checkUpdatesButton.addEventListener("click", checkAddonUpdates);