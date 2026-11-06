import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  inspectLicense,
  issueLicense,
  resetLicenseDevice,
  revokeLicense,
} from "../lib/licenseService";
import { logger } from "../lib/logger";

const commands = [
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate a software license key")
    .addIntegerOption((option) =>
      option
        .setName("hours")
        .setDescription("Validity in hours; defaults to 24")
        .setMinValue(1)
        .setMaxValue(87600),
    )
    .addStringOption((option) =>
      option.setName("note").setDescription("Internal note").setMaxLength(200),
    ),
  new SlashCommandBuilder()
    .setName("checkkey")
    .setDescription("Check a license status")
    .addStringOption((option) =>
      option.setName("key").setDescription("License key").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("resethwid")
    .setDescription("Clear a license device registration")
    .addStringOption((option) =>
      option.setName("key").setDescription("License key").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Revoke a license immediately")
    .addStringOption((option) =>
      option.setName("key").setDescription("License key").setRequired(true),
    ),
].map((command) => command.toJSON());

function configuredRoleIds(): Set<string> {
  return new Set(
    (process.env.DISCORD_LICENSE_ADMIN_ROLE_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function interactionRoleIds(interaction: ChatInputCommandInteraction): string[] {
  const member = interaction.member as unknown as {
    roles?: string[] | { cache?: { keys: () => IterableIterator<string> } };
  } | null;
  if (!member?.roles) return [];
  if (Array.isArray(member.roles)) return member.roles;
  return member.roles.cache ? [...member.roles.cache.keys()] : [];
}

function isAuthorized(interaction: ChatInputCommandInteraction): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  const allowedRoles = configuredRoleIds();
  return interactionRoleIds(interaction).some((roleId) => allowedRoles.has(roleId));
}

function remainingLabel(expiresAt: Date): string {
  const seconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAuthorized(interaction)) {
    await interaction.reply({
      content: "You do not have permission to manage licenses.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const actorId = interaction.user.id;
  if (interaction.commandName === "genkey") {
    const hours = interaction.options.getInteger("hours") ?? 24;
    const note = interaction.options.getString("note") ?? undefined;
    const created = await issueLicense({ hours, note, actorId: `discord:${actorId}` });
    await interaction.reply({
      content: [
        "License created. This key is shown only once:",
        `\`${created.key}\``,
        `Expires: <t:${Math.floor(created.expiresAt.getTime() / 1000)}:F>`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const key = interaction.options.getString("key", true);
  const license = await inspectLicense(key);
  if (!license) {
    await interaction.reply({
      content: "No license matched that key.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === "checkkey") {
    await interaction.reply({
      content: [
        `Status: **${license.status}**`,
        `Device registered: **${license.deviceBound ? "yes" : "no"}**`,
        `Remaining: **${remainingLabel(license.expiresAt)}**`,
        `Successful validations: **${license.totalValidations}**`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === "resethwid") {
    const reset = await resetLicenseDevice(license.id, `discord:${actorId}`);
    await interaction.reply({
      content: reset
        ? "Device registration cleared. The next successful validation will register a new installation."
        : "The license could not be found.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === "revoke") {
    const revoked = await revokeLicense(license.id, `discord:${actorId}`);
    await interaction.reply({
      content: revoked ? "License revoked." : "The license could not be found.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function startLicenseDiscordBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.info("Discord license commands are disabled; DISCORD_BOT_TOKEN is not configured");
    return;
  }

  if (configuredRoleIds().size === 0) {
    logger.warn("Discord license bot was not started because no admin roles are configured");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!commands.some((command) => command.name === interaction.commandName)) return;
    try {
      await handleCommand(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Discord license command failed");
      const response = {
        content: "The license command failed. Try again later.",
        ephemeral: true,
      } as const;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(() => undefined);
      } else {
        await interaction.reply(response).catch(() => undefined);
      }
    }
  });
  client.once(Events.ClientReady, async (readyClient) => {
    try {
      const rest = new REST({ version: "10" }).setToken(token);
      const guildId = process.env.DISCORD_GUILD_ID;
      const route = guildId
        ? Routes.applicationGuildCommands(readyClient.user.id, guildId)
        : Routes.applicationCommands(readyClient.user.id);
      await rest.put(route, { body: commands });
      logger.info(
        { guildCommands: Boolean(guildId) },
        "Discord license slash commands registered",
      );
    } catch (err) {
      logger.error({ err }, "Discord license slash command registration failed");
    }
  });

  await client.login(token);
}
