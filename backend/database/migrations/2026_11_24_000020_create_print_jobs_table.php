<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('print_jobs', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26);
            $table->char('order_id', 26);
            $table->char('order_file_id', 26);
            $table->char('printer_id', 26)->nullable();
            $table->char('print_agent_id', 26)->nullable();
            $table->string('status', 32)->default('queued'); // queued, leased, printing, completed, failed, unknown, cancelled
            $table->string('lease_token', 255)->nullable();
            $table->timestamp('leased_at')->nullable();
            $table->timestamp('lease_expires_at')->nullable();
            $table->json('print_settings'); // copies, color, duplex, paper_size, orientation
            $table->text('file_url')->nullable();
            $table->string('file_hash', 64); // SHA-256 string
            $table->unsignedBigInteger('file_size_bytes')->default(0);
            $table->string('spooler_job_id', 64)->nullable();
            $table->unsignedInteger('pages_total')->default(1);
            $table->unsignedInteger('pages_printed')->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->text('error_message')->nullable();
            $table->string('idempotency_key', 255)->unique();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('cascade');
            $table->foreign('order_id')->references('id')->on('orders')->onDelete('cascade');
            $table->foreign('order_file_id')->references('id')->on('order_files')->onDelete('cascade');
            $table->foreign('printer_id')->references('id')->on('printers')->onDelete('set null');
            $table->foreign('print_agent_id')->references('id')->on('print_agents')->onDelete('set null');

            $table->index(['tenant_id', 'status', 'created_at']);
            $table->index(['print_agent_id', 'status']);
            $table->index('lease_expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_jobs');
    }
};
