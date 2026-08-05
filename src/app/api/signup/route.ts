import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

type SignupBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  let body: SignupBody;

  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json(
      { message: "Invalid request payload." },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    return NextResponse.json(
      { message: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { message: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return NextResponse.json(
        { message: "This email is already registered." },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    return NextResponse.json(
      { message: "Account created successfully. You can now sign in." },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "Server error while creating account." },
      { status: 500 },
    );
  }
}
