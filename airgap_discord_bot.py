#!/usr/bin/env python3
"""Airgap Discord Bot — weekly course announcements + skill Q&A powered by Claude."""

import os
import asyncio
import datetime
import logging
import discord
from discord.ext import commands, tasks
from anthropic import Anthropic

# ── Config ────────────────────────────────────────────────────────────────────
DISCORD_BOT_TOKEN    = os.environ["DISCORD_BOT_TOKEN"]
ANTHROPIC_API_KEY    = os.environ["ANTHROPIC_API_KEY"]
ANNOUNCE_CHANNEL_ID  = int(os.environ["DISCORD_ANNOUNCE_CHANNEL_ID"])  # #course-drops
QA_CHANNEL_ID        = int(os.environ.get("DISCORD_QA_CHANNEL_ID", os.environ["DISCORD_ANNOUNCE_CHANNEL_ID"]))
TIP_CHANNEL_ID       = int(os.environ.get("DISCORD_TIP_CHANNEL_ID", os.environ["DISCORD_ANNOUNCE_CHANNEL_ID"]))
MODEL                = "claude-sonnet-4-6"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

client = Anthropic(api_key=ANTHROPIC_API_KEY)

# ── Course catalogue (used to ground Claude responses) ────────────────────────
COURSES = """
LIVE COURSES (free or members):
- Your First Leather Wallet (Craft, Free)
- Acoustic Guitar from Zero (Music, Members)
- Hand Sewing Basics (Textile, Members)
- Home Repairs You Should Know (Handyman, Members)
- Watercolour Painting (Art, Members)
- Growing Your Own Food (Garden, Free)
- Reading Deeply (Lifestyle, Free)
- Joinery Basics (Making, Members)
- Bread Baking from Scratch (Kitchen, Free)
- Knife Sharpening (Life Skills, Free)
- Drawing from Observation (Art, Free)
- Hand-Building Pottery (Craft, Members)
- Sourdough from Scratch (Kitchen, Members)
- Fermentation — Kimchi & Kraut (Kitchen, Members)
- Coffee — From Bean to Cup (Kitchen, Members)

UPCOMING (weekly Fridays):
- 14 Aug: Calligraphy — The Foundational Script
- 21 Aug: Bicycle Maintenance
- 28 Aug: Foraging for Beginners
- 4 Sep: Knitting — Your First Project
- 11 Sep: Linocut Printing
- 18 Sep: Running from Zero
- 25 Sep: Bicycle Touring
- 2 Oct: Bookbinding — Your First Journal
- 9 Oct: Electronics — The Basics
- 16 Oct: Oil Painting Basics
- 23 Oct: Candle Making
- 30 Oct: Piano for Adults
- 6 Nov: Ukulele from Zero
- 13 Nov: Upholstery Basics
- 20 Nov: Learning a Language
- 27 Nov: Natural Dyeing — Hedgerow Colours
- 4 Dec: Fresh Pasta by Hand
- 11 Dec: First Aid Essentials
- 18 Dec: Beekeeping — Your First Hive
- 25 Dec: Chess — The Fundamentals
"""

SYSTEM_PROMPT = f"""You are Crafty — the resident craft expert and teacher in the Airgap Discord community. You have deep, practical knowledge across the full range of hands-on skills: leatherwork, woodworking, sewing and textiles, drawing and painting, pottery, bread baking, sourdough, fermentation, coffee, guitar and other instruments, knife sharpening, home repairs, gardening, foraging, calligraphy, bookbinding, linocut, natural dyeing, candle making, upholstery, bicycle maintenance, running, yoga, and all related crafts.

Airgap.life is a weekly skills education platform. Membership is £8/month or £80/year. All courses follow a four-step structure: what you need → core techniques → starter project → pathway to mastery.

{COURSES}

## Your role

You are a craft expert and teacher — and that is your only role. You help people:
- Learn practical, hands-on skills
- Troubleshoot problems with their craft projects
- Choose tools and materials
- Progress from beginner to mastery
- Find the right course or resource

## Scope — strict

You answer questions about:
- Any craft, making, or handmade skill (leatherwork, sewing, woodworking, pottery, etc.)
- Cooking, baking, fermentation, and kitchen skills
- Art: drawing, painting (watercolour, oil, acrylic), printmaking, calligraphy
- Music: learning instruments (guitar, ukulele, piano, etc.)
- Gardening, growing food, foraging
- DIY, home repairs, joinery, upholstery
- Outdoor skills, cycling, running, yoga, fitness
- Life skills directly related to the craft context (e.g. memory techniques for learning scales)
- Airgap.life courses and membership

You do NOT answer questions about:
- Politics, current events, or news
- Programming, software, or technology
- Finance, investing, or economics
- Sports results or entertainment gossip
- Medical, legal, or financial advice

If asked about anything outside your scope, respond warmly but redirect: "I'm only set up to help with crafts and practical skills — that's where I live! Ask me about [a specific craft topic] instead."

## Your character
- Warm, direct, and practical — like a knowledgeable friend who happens to know everything about making things
- Deep genuine expertise: you know the feel of well-tempered leather, the sound of a properly sharpened chisel, the smell of proofing dough
- Celebrate effort and small wins
- Give concrete, actionable answers — specific techniques, measurements, and materials where relevant
- If you don't know something specific, say so and point toward reliable resources
- Keep responses concise (3–8 sentences for most questions; more for complex technique questions)
- Use Discord markdown lightly (bold for key terms, occasional bullet points)
- Never say "I'm an AI" — just answer helpfully as Crafty
- If asked about a course we don't have yet, acknowledge it and mention when we might add it"""

# ── Claude helper ─────────────────────────────────────────────────────────────

def ask_claude(user_message: str, context: str = "", max_tokens: int = 500) -> str:
    prompt = f"{context}\n\n{user_message}" if context else user_message
    resp = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text


def generate_skill_tip() -> str:
    resp = client.messages.create(
        model=MODEL,
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": (
                "Generate a short, practical skill tip for the community. "
                "Pick any hands-on skill — craft, kitchen, outdoors, repair, music, art. "
                "Format: one crisp sentence introducing the tip, then 2–3 sentences of "
                "actionable detail. No headers. Don't start with 'I'. "
                "Make it feel like something you'd tell a friend, not a blog post intro."
            ),
        }],
    )
    return resp.content[0].text


def generate_course_announcement(course_title: str, course_url: str) -> str:
    resp = client.messages.create(
        model=MODEL,
        max_tokens=250,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": (
                f"Write a short Discord announcement for the new airgap.life course just published: \"{course_title}\".\n"
                "2–3 sentences. Enthusiastic but not hype-y. Mention what people will be able to do after the course. "
                f"End with: {course_url}\n"
                "Don't use exclamation marks. No emoji. Discord markdown is fine."
            ),
        }],
    )
    return resp.content[0].text


# ── Bot setup ─────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


# ── Scheduled tasks ────────────────────────────────────────────────────────────

@tasks.loop(hours=24)
async def daily_tip():
    """Post a skill tip every day at 08:00 UTC."""
    now = datetime.datetime.now(datetime.timezone.utc)
    if now.hour != 8:
        return
    channel = bot.get_channel(TIP_CHANNEL_ID)
    if not channel:
        return
    tip = generate_skill_tip()
    await channel.send(f"**Skill of the day**\n{tip}")
    log.info("Daily tip posted.")


@tasks.loop(hours=1)
async def weekly_announce():
    """Check every hour if it's Friday 06:00 UTC — post course drop announcement."""
    now = datetime.datetime.now(datetime.timezone.utc)
    if now.weekday() != 4 or now.hour != 6:  # 4 = Friday
        return
    channel = bot.get_channel(ANNOUNCE_CHANNEL_ID)
    if not channel:
        return

    # Determine this week's course from the schedule
    upcoming = get_this_weeks_course(now.date())
    if not upcoming:
        return

    title, slug = upcoming
    url = f"https://www.airgap.life/courses/{slug}"
    announcement = generate_course_announcement(title, url)
    await channel.send(f"**New course dropping today** ✦\n\n{announcement}")
    log.info(f"Course announcement posted: {title}")


def get_this_weeks_course(today: datetime.date):
    """Return (title, slug) if a course drops today, else None."""
    schedule = {
        datetime.date(2026, 8, 14): ("Calligraphy — The Foundational Script", "calligraphy"),
        datetime.date(2026, 8, 21): ("Bicycle Maintenance", "bicycle-maintenance"),
        datetime.date(2026, 8, 28): ("Foraging for Beginners", "foraging"),
        datetime.date(2026, 9, 4):  ("Knitting — Your First Project", "knitting"),
        datetime.date(2026, 9, 11): ("Linocut Printing", "linocut"),
        datetime.date(2026, 9, 18): ("Running from Zero", "running"),
        datetime.date(2026, 9, 25): ("Bicycle Touring", "cycling"),
        datetime.date(2026, 10, 2): ("Bookbinding — Your First Journal", "bookbinding"),
        datetime.date(2026, 10, 9): ("Electronics — The Basics", "electronics-basics"),
        datetime.date(2026, 10, 16): ("Oil Painting Basics", "oil-painting"),
        datetime.date(2026, 10, 23): ("Candle Making", "candle-making"),
        datetime.date(2026, 10, 30): ("Piano for Adults", "piano"),
        datetime.date(2026, 11, 6): ("Ukulele from Zero", "ukulele"),
        datetime.date(2026, 11, 13): ("Upholstery Basics", "upholstery"),
        datetime.date(2026, 11, 20): ("Learning a Language", "language"),
        datetime.date(2026, 11, 27): ("Natural Dyeing — Hedgerow Colours", "natural-dyeing"),
        datetime.date(2026, 12, 4): ("Fresh Pasta by Hand", "pasta"),
        datetime.date(2026, 12, 11): ("First Aid Essentials", "first-aid"),
        datetime.date(2026, 12, 18): ("Beekeeping — Your First Hive", "beekeeping"),
        datetime.date(2026, 12, 25): ("Chess — The Fundamentals", "chess"),
        datetime.date(2027, 1, 1):  ("Meditation — Beginning the Practice", "meditation"),
        datetime.date(2027, 1, 8):  ("Film Photography", "photography"),
    }
    return schedule.get(today)


# ── Commands ───────────────────────────────────────────────────────────────────

@bot.command(name="ask")
async def ask_command(ctx, *, question: str):
    """!ask <question> — ask the Airgap assistant anything about skills."""
    async with ctx.typing():
        answer = ask_claude(question)
    await ctx.reply(answer)


@bot.command(name="courses")
async def courses_command(ctx):
    """!courses — list live courses."""
    lines = [
        "**Live courses at airgap.life** — <https://www.airgap.life/courses>\n",
        "Free: Leather Wallet · Bread Baking · Knife Sharpening · Drawing · Growing Food · Reading",
        "Members: Guitar · Sewing · Watercolour · Joinery · Pottery · Sourdough · Fermentation · Coffee · Home Repairs",
        "\nMembership: £8/month or £80/year — <https://www.airgap.life/#membership>",
    ]
    await ctx.reply("\n".join(lines))


@bot.command(name="next")
async def next_command(ctx):
    """!next — show the next course dropping."""
    today = datetime.date.today()
    schedule = {
        datetime.date(2026, 8, 14): ("Calligraphy — The Foundational Script", "calligraphy"),
        datetime.date(2026, 8, 21): ("Bicycle Maintenance", "bicycle-maintenance"),
        datetime.date(2026, 8, 28): ("Foraging for Beginners", "foraging"),
        datetime.date(2026, 9, 4):  ("Knitting — Your First Project", "knitting"),
        datetime.date(2026, 9, 11): ("Linocut Printing", "linocut"),
        datetime.date(2026, 9, 18): ("Running from Zero", "running"),
        datetime.date(2026, 9, 25): ("Bicycle Touring", "cycling"),
        datetime.date(2026, 10, 2): ("Bookbinding — Your First Journal", "bookbinding"),
        datetime.date(2026, 10, 9): ("Electronics — The Basics", "electronics-basics"),
        datetime.date(2026, 10, 16): ("Oil Painting Basics", "oil-painting"),
        datetime.date(2026, 10, 23): ("Candle Making", "candle-making"),
        datetime.date(2026, 10, 30): ("Piano for Adults", "piano"),
        datetime.date(2026, 11, 6): ("Ukulele from Zero", "ukulele"),
        datetime.date(2026, 11, 13): ("Upholstery Basics", "upholstery"),
        datetime.date(2026, 11, 20): ("Learning a Language", "language"),
        datetime.date(2026, 11, 27): ("Natural Dyeing — Hedgerow Colours", "natural-dyeing"),
        datetime.date(2026, 12, 4): ("Fresh Pasta by Hand", "pasta"),
        datetime.date(2026, 12, 11): ("First Aid Essentials", "first-aid"),
        datetime.date(2026, 12, 18): ("Beekeeping — Your First Hive", "beekeeping"),
        datetime.date(2026, 12, 25): ("Chess — The Fundamentals", "chess"),
        datetime.date(2027, 1, 1):  ("Meditation — Beginning the Practice", "meditation"),
        datetime.date(2027, 1, 8):  ("Film Photography", "photography"),
    }
    future = [(d, t, s) for d, (t, s) in schedule.items() if d >= today]
    if not future:
        await ctx.reply("No more scheduled courses — check back soon.")
        return
    future.sort()
    drop_date, title, slug = future[0]
    days = (drop_date - today).days
    when = "today" if days == 0 else f"in {days} day{'s' if days != 1 else ''} ({drop_date.strftime('%A %-d %B')})"
    await ctx.reply(
        f"**Next course:** {title}\n"
        f"Drops {when} — <https://www.airgap.life/courses/{slug}>"
    )


@bot.command(name="tip")
async def tip_command(ctx):
    """!tip — get a skill tip on demand."""
    async with ctx.typing():
        tip = generate_skill_tip()
    await ctx.reply(tip)


# ── Mention handler (Q&A in any channel) ──────────────────────────────────────

@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return

    # Respond when @mentioned (user or role), or name used as plain text
    bot_name = (bot.user.display_name or bot.user.name).lower()
    triggered = (
        bot.user in message.mentions
        or f"<@{bot.user.id}>" in message.content
        or f"<@!{bot.user.id}>" in message.content
        or bot_name in message.content.lower()
    )
    if triggered:
        question = message.content.replace(f"<@{bot.user.id}>", "").strip()
        if not question:
            await message.reply("Ask me anything about skills or our courses — what do you want to learn?")
            return
        try:
            async with message.channel.typing():
                answer = ask_claude(question)
            await message.reply(answer)
            log.info(f"Replied to {message.author}: {answer[:80]}...")
        except Exception as e:
            log.error(f"Failed to reply: {e}")
        return

    # Process prefix commands too
    await bot.process_commands(message)


# ── Startup ────────────────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    log.info(f"Logged in as {bot.user} (id: {bot.user.id})")
    if not daily_tip.is_running():
        daily_tip.start()
    if not weekly_announce.is_running():
        weekly_announce.start()


bot.run(DISCORD_BOT_TOKEN)
