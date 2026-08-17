require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
} = require("discord.js");

const {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus,
    entersState,
} = require("@discordjs/voice");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const commands = [
    new SlashCommandBuilder()
        .setName("join")
        .setDescription("Join your current voice channel"),

    new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Leave the voice channel"),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

async function registerCommands() {
    try {
        console.log("Registering slash commands...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log("Slash commands registered.");
    } catch (error) {
        console.error(error);
    }
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands();
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "join") {
        const member = interaction.member;

        if (!member.voice.channel) {
            return interaction.reply({
                content: "❌ Please join a Voice Channel first.",
                ephemeral: true,
            });
        }

        const channel = member.voice.channel;
        const existing = getVoiceConnection(interaction.guild.id);

        if (existing) {
            return interaction.reply({
                content: `✅ I am already in **${channel.name}** Voice Channel.`,
                ephemeral: true,
            });
        }

        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: true,
            });

            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                30_000
            );

            connection.on(
                VoiceConnectionStatus.Disconnected,
                async () => {
                    try {
                        await Promise.race([
                            entersState(
                                connection,
                                VoiceConnectionStatus.Signalling,
                                5_000
                            ),
                            entersState(
                                connection,
                                VoiceConnectionStatus.Connecting,
                                5_000
                            ),
                        ]);
                    } catch {
                        connection.destroy();
                    }
                }
            );

            await interaction.reply({
                content: `✅ Successfully joined **${channel.name}**!`,
            });

        } catch (error) {
            console.error(error);

            return interaction.reply({
                content:
                    "❌ I couldn't join the Voice Channel. Please check my permissions.",
                ephemeral: true,
            });
        }
    }

    if (interaction.commandName === "leave") {
        const connection = getVoiceConnection(interaction.guild.id);

        if (!connection) {
            return interaction.reply({
                content: "❌ I am not in any Voice Channel.",
                ephemeral: true,
            });
        }

        connection.destroy();

        await interaction.reply({
            content: "👋 I have left the Voice Channel.",
        });
    }
});

client.login(process.env.TOKEN);
