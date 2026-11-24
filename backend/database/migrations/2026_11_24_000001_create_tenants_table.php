<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('edition', 32)->default('standalone'); // saas, standalone
            $table->string('status', 32)->default('active'); // pending, active, grace, suspended, cancelled
            $table->string('default_currency', 3)->default('BDT');
            $table->string('default_locale', 10)->default('bn');
            $table->string('timezone', 64)->default('Asia/Dhaka');
            $table->json('settings_json')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
